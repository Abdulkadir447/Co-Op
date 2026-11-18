package com.coop.android.core.sync

import android.content.Context
import androidx.room.withTransaction
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.coop.android.CoopApplication
import com.coop.android.core.auth.SessionManager
import com.coop.android.core.local.*
import com.coop.android.core.network.ApiClientFactory
import com.coop.android.core.network.CoopApiService
import com.coop.android.core.network.dto.SyncPullResponseDto
import com.coop.android.core.network.dto.SyncPushOperationDto
import com.coop.android.core.network.dto.SyncPushRequestDto
import com.coop.android.core.util.UlidGenerator
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.Instant
import java.time.LocalDate
import java.util.concurrent.TimeUnit

data class SyncStatusState(
    val isOnline: Boolean = true,
    val isSyncing: Boolean = false,
    val mirrorReady: Boolean = false,
    val pendingCount: Int = 0,
    val conflictCount: Int = 0,
    val lastPullAt: String? = null,
    val lastPushAt: String? = null,
    val lastCursor: String? = null,
    val lastError: String? = null,
)

class SyncEngine(
    private val context: Context,
    private val db: CoopDatabase,
    private val api: CoopApiService,
    private val sessionManager: SessionManager,
    val connectivity: ConnectivityObserver,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val json = ApiClientFactory.json

    private val _isSyncing = MutableStateFlow(false)
    private val _mirrorReady = MutableStateFlow(false)
    private val _lastPullAt = MutableStateFlow<String?>(null)
    private val _lastPushAt = MutableStateFlow<String?>(null)
    private val _lastCursor = MutableStateFlow<String?>(null)
    private val _lastError = MutableStateFlow<String?>(null)

    val status: StateFlow<SyncStatusState> = combine(
        combine(
            connectivity.isOnline,
            _isSyncing,
            _mirrorReady,
            db.syncOutboxDao().observePendingCount(),
            db.syncOutboxDao().observeConflictCount(),
        ) { online, syncing, mirror, pending, conflicts ->
            SyncStatusState(
                isOnline = online,
                isSyncing = syncing,
                mirrorReady = mirror,
                pendingCount = pending,
                conflictCount = conflicts,
            )
        },
        combine(_lastPullAt, _lastPushAt, _lastCursor, _lastError) { pull, push, cursor, err ->
            listOf(pull, push, cursor, err)
        },
    ) { base, meta ->
        base.copy(
            lastPullAt = meta[0],
            lastPushAt = meta[1],
            lastCursor = meta[2],
            lastError = meta[3],
        )
    }.stateIn(scope, SharingStarted.Eagerly, SyncStatusState())

    val activeQueue: Flow<List<SyncOutboxEntity>> = db.syncOutboxDao().observeActiveQueue()
    val conflicts: Flow<List<SyncOutboxEntity>> = db.syncOutboxDao().observeConflicts()

    init {
        scope.launch {
            _mirrorReady.value = db.syncMetaDao().get(META_MIRROR_READY) == "1"
            _lastCursor.value = db.syncMetaDao().get(META_CURSOR)
            _lastPullAt.value = db.syncMetaDao().get(META_LAST_PULL)
            _lastPushAt.value = db.syncMetaDao().get(META_LAST_PUSH)
        }
        scope.launch {
            connectivity.isOnline.collect { online ->
                if (online && sessionManager.state.value.isSignedIn && !sessionManager.state.value.isDemoMode) {
                    syncNow()
                }
            }
        }
    }

    fun schedulePeriodicBackgroundSync() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
        val req = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            req,
        )
    }

    suspend fun enqueueOutbox(
        entity: String,
        entityLocalId: Int,
        clientId: String,
        operation: String,
        payload: JsonObject,
    ) {
        db.syncOutboxDao().insert(
            SyncOutboxEntity(
                entity = entity,
                entityLocalId = entityLocalId,
                clientId = clientId,
                operation = operation,
                payloadJson = payload.toString(),
                status = "pending",
                createdAt = Instant.now().toString(),
            ),
        )
    }

    suspend fun syncNow(forceFullPull: Boolean = false): Result<Unit> {
        val session = sessionManager.state.value
        if (!session.isSignedIn || session.isDemoMode) {
            return Result.success(Unit)
        }
        if (!connectivity.isOnline.value) {
            return Result.failure(IllegalStateException("Device is offline"))
        }
        if (_isSyncing.value) return Result.success(Unit)

        _isSyncing.value = true
        _lastError.value = null
        return try {
            // 1. Push pending outbox ops first
            val pending = db.syncOutboxDao().getPending()
            if (pending.isNotEmpty()) {
                val pushOps = pending.map { op ->
                    val payloadObj = runCatching {
                        json.decodeFromString(JsonObject.serializer(), op.payloadJson)
                    }.getOrElse { JsonObject(emptyMap()) }
                    SyncPushOperationDto(
                        entity = op.entity,
                        clientId = op.clientId,
                        operation = op.operation,
                        payload = payloadObj,
                        operationId = op.id.toString(),
                    )
                }
                val pushRes = api.syncPush(SyncPushRequestDto(pushOps))
                val conflictByOpId = pushRes.conflicts.associateBy { it.operationId }
                for (op in pending) {
                    val conflict = conflictByOpId[op.id.toString()]
                    if (conflict != null) {
                        db.syncOutboxDao().update(
                            op.copy(
                                status = "conflict",
                                conflictReason = conflict.reason,
                                conflictMessage = conflict.message ?: conflict.reason,
                                localSnapshotJson = conflict.local.toString(),
                                serverSnapshotJson = conflict.server.toString(),
                                attempts = op.attempts + 1,
                            ),
                        )
                    } else {
                        db.syncOutboxDao().update(
                            op.copy(
                                status = "resolved",
                                attempts = op.attempts + 1,
                            ),
                        )
                    }
                }
                val nowIso = Instant.now().toString()
                db.syncMetaDao().set(SyncMetaEntity(META_LAST_PUSH, nowIso))
                _lastPushAt.value = nowIso
            }

            // 2. Pull delta or full dump
            val since = if (forceFullPull) null else db.syncMetaDao().get(META_CURSOR)
            val pull = api.syncPull(since = since)
            ingestPull(pull, clearFirst = forceFullPull || pull.fullDump)

            val nowIso = Instant.now().toString()
            pull.cursor?.let {
                db.syncMetaDao().set(SyncMetaEntity(META_CURSOR, it))
                _lastCursor.value = it
            }
            db.syncMetaDao().set(SyncMetaEntity(META_LAST_PULL, nowIso))
            db.syncMetaDao().set(SyncMetaEntity(META_MIRROR_READY, "1"))
            _lastPullAt.value = nowIso
            _mirrorReady.value = true
            Result.success(Unit)
        } catch (e: Exception) {
            _lastError.value = e.message ?: "Sync failed"
            Result.failure(e)
        } finally {
            _isSyncing.value = false
        }
    }

    private suspend fun ingestPull(pull: SyncPullResponseDto, clearFirst: Boolean) {
        db.withTransaction {
            if (clearFirst) {
                db.orderDao().clearAllItems()
                db.orderDao().clearAllOrders()
                db.stockMovementDao().clearAll()
                db.productDao().clearAll()
                db.customerDao().clearAll()
            }

            val custDao = db.customerDao()
            for (c in pull.customers) {
                val cid = c.clientId ?: "srv-cust-${c.id}"
                val existing = custDao.getByClientId(cid) ?: custDao.getByServerId(c.id)
                val entity = CustomerEntity(
                    id = existing?.id ?: 0,
                    serverId = c.id,
                    clientId = existing?.clientId ?: cid,
                    fullName = c.fullName,
                    email = c.email,
                    phone = c.phone,
                    address = c.address,
                    company = c.company,
                    createdAt = existing?.createdAt ?: c.updatedAt,
                    updatedAt = c.updatedAt,
                    deletedAt = c.deletedAt,
                    pendingSync = false,
                )
                if (existing == null) custDao.insert(entity) else custDao.update(entity)
            }

            val prodDao = db.productDao()
            for (p in pull.products) {
                val cid = p.clientId ?: "srv-prod-${p.id}"
                val existing = prodDao.getByClientId(cid) ?: prodDao.getByServerId(p.id)
                val entity = ProductEntity(
                    id = existing?.id ?: 0,
                    serverId = p.id,
                    clientId = existing?.clientId ?: cid,
                    sku = p.sku,
                    name = p.name,
                    description = p.description,
                    category = p.category,
                    unitPrice = p.unitPrice,
                    costPrice = p.costPrice,
                    currentStock = p.currentStock,
                    reorderLevel = p.reorderLevel,
                    createdAt = existing?.createdAt ?: p.updatedAt,
                    updatedAt = p.updatedAt,
                    deletedAt = p.deletedAt,
                    pendingSync = false,
                )
                if (existing == null) prodDao.insert(entity) else prodDao.update(entity)
            }

            val orderDao = db.orderDao()
            for (o in pull.orders) {
                val cid = o.clientId ?: "srv-ord-${o.id}"
                val existing = orderDao.getByClientId(cid) ?: orderDao.getByServerId(o.id)
                val cust = custDao.getByServerId(o.customerId)
                val entity = OrderEntity(
                    id = existing?.id ?: 0,
                    serverId = o.id,
                    clientId = existing?.clientId ?: cid,
                    customerId = o.customerId,
                    customerServerId = o.customerId,
                    customerName = cust?.fullName ?: existing?.customerName,
                    status = o.status,
                    totalAmount = o.totalAmount,
                    grandTotal = existing?.grandTotal?.takeIf { it > 0.0 } ?: o.totalAmount,
                    balanceDue = existing?.balanceDue ?: o.totalAmount,
                    orderDate = o.orderDate,
                    createdAt = existing?.createdAt ?: o.orderDate ?: o.updatedAt,
                    updatedAt = o.updatedAt,
                    deletedAt = o.deletedAt,
                    pendingSync = false,
                )
                if (existing == null) orderDao.insertOrder(entity) else orderDao.updateOrder(entity)
            }

            for (it in pull.orderItems) {
                val cid = it.clientId ?: "srv-oi-${it.id}"
                val existing = orderDao.getItemByClientId(cid)
                val prod = prodDao.getByServerId(it.productId)
                val ord = orderDao.getByServerId(it.orderId)
                orderDao.insertOrderItem(
                    OrderItemEntity(
                        id = existing?.id ?: 0,
                        serverId = it.id,
                        clientId = existing?.clientId ?: cid,
                        orderId = ord?.id ?: it.orderId,
                        productId = it.productId,
                        productServerId = it.productId,
                        productName = prod?.name ?: existing?.productName,
                        quantity = it.quantity,
                        unitPrice = it.unitPrice,
                        totalPrice = it.totalPrice,
                        updatedAt = it.updatedAt,
                        deletedAt = it.deletedAt,
                    ),
                )
            }

            val movDao = db.stockMovementDao()
            for (m in pull.stockMovements) {
                val cid = m.clientId ?: "srv-mov-${m.id}"
                if (movDao.getByClientId(cid) == null) {
                    movDao.insert(
                        StockMovementEntity(
                            serverId = m.id,
                            clientId = cid,
                            productId = m.productId,
                            productServerId = m.productId,
                            change = m.change,
                            reason = m.reason,
                            note = m.note,
                            orderId = m.orderId,
                            createdAt = m.createdAt,
                        ),
                    )
                }
            }
        }
    }

    suspend fun resolveConflictWithNewValue(outboxId: Long, field: String, newValue: String) {
        val op = db.syncOutboxDao().getById(outboxId) ?: return
        val existingObj = runCatching {
            json.decodeFromString(JsonObject.serializer(), op.payloadJson)
        }.getOrElse { JsonObject(emptyMap()) }
        val updatedObj = buildJsonObject {
            existingObj.forEach { (k, v) -> if (k != field) put(k, v) }
            put(field, JsonPrimitive(newValue))
        }
        db.syncOutboxDao().update(
            op.copy(
                payloadJson = updatedObj.toString(),
                status = "pending",
                conflictReason = null,
                conflictMessage = null,
            ),
        )
        // Also update local mirror row so UI reflects the fixed value immediately
        when (op.entity) {
            "customer" -> db.customerDao().getByIdOrServerId(op.entityLocalId)?.let { c ->
                if (field == "email") db.customerDao().update(c.copy(email = newValue))
            }
            "product" -> db.productDao().getByIdOrServerId(op.entityLocalId)?.let { p ->
                if (field == "sku") db.productDao().update(p.copy(sku = newValue))
            }
            "order" -> db.orderDao().getByIdOrServerId(op.entityLocalId)?.let { o ->
                if (field == "status") db.orderDao().updateOrder(o.copy(status = newValue))
            }
        }
        if (connectivity.isOnline.value) syncNow()
    }

    suspend fun resolveConflictRetry(outboxId: Long) {
        val op = db.syncOutboxDao().getById(outboxId) ?: return
        db.syncOutboxDao().update(
            op.copy(status = "pending", conflictReason = null, conflictMessage = null),
        )
        if (connectivity.isOnline.value) syncNow()
    }

    suspend fun resolveConflictKeepCloud(outboxId: Long) {
        val op = db.syncOutboxDao().getById(outboxId) ?: return
        db.syncOutboxDao().update(op.copy(status = "resolved"))
        if (connectivity.isOnline.value) {
            syncNow(forceFullPull = true)
        } else if (op.operation == "create") {
            when (op.entity) {
                "customer" -> db.customerDao().hardDelete(op.entityLocalId)
                "product" -> db.productDao().hardDelete(op.entityLocalId)
                "order" -> db.orderDao().hardDeleteOrder(op.entityLocalId)
            }
        }
    }

    suspend fun resolveConflictDiscard(outboxId: Long) {
        val op = db.syncOutboxDao().getById(outboxId) ?: return
        db.syncOutboxDao().update(op.copy(status = "resolved"))
    }

    suspend fun seedDemoDataIfEmpty() {
        if (db.productDao().getAll().isNotEmpty()) {
            _mirrorReady.value = true
            return
        }
        val today = LocalDate.now()
        val nowIso = Instant.now().toString()
        db.withTransaction {
            val p1 = db.productDao().insert(
                ProductEntity(
                    serverId = 1, clientId = UlidGenerator.next(), sku = "COF-ESP-01",
                    name = "Single Origin Espresso Beans (1kg)", category = "Coffee",
                    unitPrice = 28.00, costPrice = 14.50, currentStock = 42, reorderLevel = 15,
                    createdAt = nowIso, updatedAt = nowIso,
                ),
            ).toInt()
            val p2 = db.productDao().insert(
                ProductEntity(
                    serverId = 2, clientId = UlidGenerator.next(), sku = "TEA-MAT-02",
                    name = "Ceremonial Matcha Tin (250g)", category = "Tea",
                    unitPrice = 34.00, costPrice = 16.00, currentStock = 8, reorderLevel = 12,
                    createdAt = nowIso, updatedAt = nowIso,
                ),
            ).toInt()
            val p3 = db.productDao().insert(
                ProductEntity(
                    serverId = 3, clientId = UlidGenerator.next(), sku = "EQP-GRN-03",
                    name = "Precision Burr Grinder", category = "Equipment",
                    unitPrice = 145.00, costPrice = 82.00, currentStock = 0, reorderLevel = 4,
                    createdAt = nowIso, updatedAt = nowIso,
                ),
            ).toInt()
            val p4 = db.productDao().insert(
                ProductEntity(
                    serverId = 4, clientId = UlidGenerator.next(), sku = "SYR-VAN-04",
                    name = "Madagascar Vanilla Syrup (750ml)", category = "Syrups",
                    unitPrice = 14.50, costPrice = 6.20, currentStock = 65, reorderLevel = 20,
                    createdAt = nowIso, updatedAt = nowIso,
                ),
            ).toInt()

            val c1 = db.customerDao().insert(
                CustomerEntity(
                    serverId = 1, clientId = UlidGenerator.next(),
                    fullName = "Adaeze Okafor", email = "adaeze@lagosroasters.ng",
                    phone = "+234 803 555 0142", company = "Lagos Roasters Ltd",
                    address = "14 Victoria Island, Lagos", createdAt = today.minusDays(45).toString(),
                ),
            ).toInt()
            val c2 = db.customerDao().insert(
                CustomerEntity(
                    serverId = 2, clientId = UlidGenerator.next(),
                    fullName = "Marcus Vance", email = "marcus@cornerbistro.com",
                    phone = "+1 415 555 0198", company = "Corner Bistro",
                    address = "810 Valencia St, San Francisco", createdAt = today.minusDays(12).toString(),
                ),
            ).toInt()

            val o1 = db.orderDao().insertOrder(
                OrderEntity(
                    serverId = 101, clientId = UlidGenerator.next(),
                    customerId = c1, customerServerId = 1, customerName = "Adaeze Okafor",
                    status = "delivered", totalAmount = 280.0, taxRate = 7.5, taxAmount = 21.0,
                    grandTotal = 301.0, amountPaid = 301.0, balanceDue = 0.0, paymentStatus = "paid",
                    orderDate = today.minusDays(34).toString(), createdAt = today.minusDays(34).toString(),
                    invoiceNumber = "INV-0001",
                ),
            ).toInt()
            db.orderDao().insertOrderItem(
                OrderItemEntity(
                    serverId = 1001, clientId = UlidGenerator.next(), orderId = o1,
                    productId = p1, productServerId = 1, productName = "Single Origin Espresso Beans (1kg)",
                    quantity = 10, unitPrice = 28.0, totalPrice = 280.0,
                ),
            )

            val o2 = db.orderDao().insertOrder(
                OrderEntity(
                    serverId = 102, clientId = UlidGenerator.next(),
                    customerId = c2, customerServerId = 2, customerName = "Marcus Vance",
                    status = "confirmed", totalAmount = 213.0, taxRate = 7.5, taxAmount = 15.98,
                    grandTotal = 228.98, amountPaid = 100.0, balanceDue = 128.98, paymentStatus = "partial",
                    orderDate = today.toString(), createdAt = today.toString(),
                    invoiceNumber = "INV-0002",
                ),
            ).toInt()
            db.orderDao().insertOrderItem(
                OrderItemEntity(
                    serverId = 1002, clientId = UlidGenerator.next(), orderId = o2,
                    productId = p2, productServerId = 2, productName = "Ceremonial Matcha Tin (250g)",
                    quantity = 5, unitPrice = 34.0, totalPrice = 170.0,
                ),
            )
            db.orderDao().insertOrderItem(
                OrderItemEntity(
                    serverId = 1003, clientId = UlidGenerator.next(), orderId = o2,
                    productId = p4, productServerId = 4, productName = "Madagascar Vanilla Syrup (750ml)",
                    quantity = 3, unitPrice = 14.5, totalPrice = 43.5,
                ),
            )

            db.stockMovementDao().insert(
                StockMovementEntity(
                    serverId = 1, clientId = UlidGenerator.next(), productId = p1, productServerId = 1,
                    change = 52, reason = "purchase", note = "Initial roastery intake", createdAt = today.minusDays(40).toString(),
                ),
            )
            db.stockMovementDao().insert(
                StockMovementEntity(
                    serverId = 2, clientId = UlidGenerator.next(), productId = p3, productServerId = 3,
                    change = -2, reason = "sale", note = "Fulfilled counter orders", createdAt = today.minusDays(5).toString(),
                ),
            )
            db.syncMetaDao().set(SyncMetaEntity(META_MIRROR_READY, "1"))
        }
        _mirrorReady.value = true
    }

    companion object {
        private const val META_CURSOR = "pull_cursor"
        private const val META_MIRROR_READY = "mirror_ready"
        private const val META_LAST_PULL = "last_pull_at"
        private const val META_LAST_PUSH = "last_push_at"
        private const val WORK_NAME = "coop_periodic_sync"
    }
}

class SyncWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext as? CoopApplication ?: return Result.success()
        val syncResult = app.container.syncEngine.syncNow()
        return if (syncResult.isSuccess) Result.success() else Result.retry()
    }
}
