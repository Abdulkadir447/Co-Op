package com.coop.android.data.repository

import androidx.room.withTransaction
import com.coop.android.core.auth.SessionManager
import com.coop.android.core.local.*
import com.coop.android.core.network.CoopApiService
import com.coop.android.core.network.dto.*
import com.coop.android.core.offline.LocalAnalyticsEngine
import com.coop.android.core.offline.LocalOrderMath
import com.coop.android.core.sync.SyncEngine
import com.coop.android.core.util.UlidGenerator
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import java.time.Instant

class ProductRepository(
    private val db: CoopDatabase,
    private val api: CoopApiService,
    private val syncEngine: SyncEngine,
    private val session: SessionManager,
) {
    fun observeProducts(): Flow<List<ProductOutDto>> =
        db.productDao().observeAll().map { list -> list.map { it.toDto() } }

    suspend fun refreshFromRemote(): Result<List<ProductOutDto>> {
        if (session.state.value.isDemoMode || !syncEngine.connectivity.isOnline.value) {
            return Result.success(db.productDao().getAll().map { it.toDto() })
        }
        return runCatching {
            val res = api.listProducts(page = 1, limit = 200)
            syncEngine.syncNow()
            res.items
        }
    }

    suspend fun getProduct(id: Int): Result<ProductOutDto> {
        val local = db.productDao().getByIdOrServerId(id)
        if (local != null) return Result.success(local.toDto())
        return runCatching { api.getProduct(id) }
    }

    suspend fun createProduct(req: ProductCreateDto): Result<ProductOutDto> = runCatching {
        val now = Instant.now().toString()
        val cid = UlidGenerator.next()
        if (!session.state.value.isDemoMode && syncEngine.connectivity.isOnline.value) {
            val remote = api.createProduct(req)
            db.productDao().insert(
                ProductEntity(
                    serverId = remote.id,
                    clientId = cid,
                    sku = remote.sku,
                    name = remote.name,
                    description = remote.description,
                    category = remote.category,
                    unitPrice = remote.unitPrice,
                    costPrice = remote.costPrice,
                    currentStock = remote.currentStock,
                    reorderLevel = remote.reorderLevel,
                    version = remote.version,
                    createdAt = remote.createdAt ?: now,
                    updatedAt = remote.updatedAt ?: now,
                ),
            )
            remote
        } else {
            val localId = db.productDao().insert(
                ProductEntity(
                    clientId = cid,
                    sku = req.sku.trim(),
                    name = req.name.trim(),
                    description = req.description?.trim(),
                    category = req.category?.trim(),
                    unitPrice = req.unitPrice,
                    costPrice = req.costPrice,
                    currentStock = req.currentStock,
                    reorderLevel = req.reorderLevel,
                    createdAt = now,
                    updatedAt = now,
                    pendingSync = !session.state.value.isDemoMode,
                ),
            ).toInt()
            if (!session.state.value.isDemoMode) {
                syncEngine.enqueueOutbox(
                    entity = "product",
                    entityLocalId = localId,
                    clientId = cid,
                    operation = "create",
                    payload = buildJsonObject {
                        put("sku", req.sku.trim())
                        put("name", req.name.trim())
                        req.description?.let { put("description", it) }
                        req.category?.let { put("category", it) }
                        put("unit_price", req.unitPrice)
                        req.costPrice?.let { put("cost_price", it) }
                        put("current_stock", req.currentStock)
                        put("reorder_level", req.reorderLevel)
                    },
                )
            }
            db.productDao().getByIdOrServerId(localId)!!.toDto()
        }
    }

    suspend fun updateProduct(id: Int, req: ProductUpdateDto): Result<ProductOutDto> = runCatching {
        val local = db.productDao().getByIdOrServerId(id)
        val now = Instant.now().toString()
        if (!session.state.value.isDemoMode && syncEngine.connectivity.isOnline.value && (local?.serverId != null || local == null)) {
            val remote = api.updateProduct(local?.serverId ?: id, req)
            if (local != null) {
                db.productDao().update(
                    local.copy(
                        name = remote.name,
                        description = remote.description,
                        category = remote.category,
                        unitPrice = remote.unitPrice,
                        costPrice = remote.costPrice,
                        reorderLevel = remote.reorderLevel,
                        updatedAt = remote.updatedAt ?: now,
                    ),
                )
            }
            remote
        } else {
            val target = local ?: error("Product not found offline")
            val updated = target.copy(
                name = req.name ?: target.name,
                description = req.description ?: target.description,
                category = req.category ?: target.category,
                unitPrice = req.unitPrice ?: target.unitPrice,
                costPrice = req.costPrice ?: target.costPrice,
                reorderLevel = req.reorderLevel ?: target.reorderLevel,
                updatedAt = now,
                pendingSync = !session.state.value.isDemoMode,
            )
            db.productDao().update(updated)
            if (!session.state.value.isDemoMode) {
                syncEngine.enqueueOutbox(
                    entity = "product",
                    entityLocalId = target.id,
                    clientId = target.clientId,
                    operation = "update",
                    payload = buildJsonObject {
                        req.name?.let { put("name", it) }
                        req.description?.let { put("description", it) }
                        req.category?.let { put("category", it) }
                        req.unitPrice?.let { put("unit_price", it) }
                        req.costPrice?.let { put("cost_price", it) }
                        req.reorderLevel?.let { put("reorder_level", it) }
                    },
                )
            }
            updated.toDto()
        }
    }

    suspend fun deleteProduct(id: Int): Result<Unit> = runCatching {
        val local = db.productDao().getByIdOrServerId(id)
        val now = Instant.now().toString()
        if (!session.state.value.isDemoMode && syncEngine.connectivity.isOnline.value && (local?.serverId != null || local == null)) {
            api.deleteProduct(local?.serverId ?: id)
            if (local != null) db.productDao().update(local.copy(deletedAt = now))
        } else if (local != null) {
            db.productDao().update(local.copy(deletedAt = now, pendingSync = !session.state.value.isDemoMode))
            if (!session.state.value.isDemoMode) {
                syncEngine.enqueueOutbox(
                    entity = "product",
                    entityLocalId = local.id,
                    clientId = local.clientId,
                    operation = "delete",
                    payload = buildJsonObject {},
                )
            }
        }
    }

    suspend fun adjustStock(productId: Int, req: AdjustStockRequestDto): Result<ProductOutDto> = runCatching {
        require(req.change != 0) { "Adjustment quantity cannot be zero." }
        val local = db.productDao().getByIdOrServerId(productId)
        val now = Instant.now().toString()
        if (!session.state.value.isDemoMode && syncEngine.connectivity.isOnline.value && (local?.serverId != null || local == null)) {
            val remote = api.adjustStock(local?.serverId ?: productId, req)
            if (local != null) {
                db.productDao().update(local.copy(currentStock = remote.currentStock, version = remote.version, updatedAt = now))
            }
            db.stockMovementDao().insert(
                StockMovementEntity(
                    clientId = UlidGenerator.next(),
                    productId = local?.id ?: productId,
                    productServerId = remote.id,
                    change = req.change,
                    reason = req.reason,
                    note = req.note,
                    actor = session.state.value.userId,
                    createdAt = now,
                ),
            )
            remote
        } else {
            val target = local ?: error("Product not found offline")
            val nextStock = target.currentStock + req.change
            require(nextStock >= 0) { "Stock cannot go below 0 (current ${target.currentStock})." }
            val movCid = UlidGenerator.next()
            val updated = target.copy(currentStock = nextStock, version = target.version + 1, updatedAt = now)
            db.withTransaction {
                db.productDao().update(updated)
                db.stockMovementDao().insert(
                    StockMovementEntity(
                        clientId = movCid,
                        productId = target.id,
                        productServerId = target.serverId,
                        change = req.change,
                        reason = req.reason,
                        note = req.note,
                        actor = session.state.value.userId,
                        createdAt = now,
                    ),
                )
            }
            if (!session.state.value.isDemoMode) {
                syncEngine.enqueueOutbox(
                    entity = "stock_movement",
                    entityLocalId = target.id,
                    clientId = movCid,
                    operation = "create",
                    payload = buildJsonObject {
                        put("product_client_id", target.clientId)
                        target.serverId?.let { put("product_id", it) }
                        put("change", req.change)
                        put("reason", req.reason)
                        req.note?.let { put("note", it) }
                    },
                )
            }
            updated.toDto()
        }
    }

    suspend fun getMovements(productId: Int): Result<List<StockMovementOutDto>> = runCatching {
        val local = db.productDao().getByIdOrServerId(productId)
        if (!session.state.value.isDemoMode && syncEngine.connectivity.isOnline.value && local?.serverId != null) {
            api.listMovements(local.serverId).items
        } else {
            db.stockMovementDao().getForProduct(productId).map {
                StockMovementOutDto(
                    id = it.serverId ?: it.id,
                    productId = it.productServerId ?: it.productId,
                    change = it.change,
                    reason = it.reason,
                    note = it.note,
                    orderId = it.orderId,
                    actor = it.actor,
                    createdAt = it.createdAt,
                )
            }
        }
    }

    suspend fun getInventorySummary(): Result<InventorySummaryDto> = runCatching {
        if (!session.state.value.isDemoMode && syncEngine.connectivity.isOnline.value) {
            runCatching { api.getInventorySummary() }.getOrElse {
                LocalAnalyticsEngine.computeInventorySummary(db.productDao().getAll())
            }
        } else {
            LocalAnalyticsEngine.computeInventorySummary(db.productDao().getAll())
        }
    }

    private fun ProductEntity.toDto() = ProductOutDto(
        id = serverId ?: id,
        sku = sku,
        name = name,
        description = description,
        category = category,
        unitPrice = unitPrice,
        costPrice = costPrice,
        currentStock = currentStock,
        reorderLevel = reorderLevel,
        createdAt = createdAt,
        updatedAt = updatedAt,
        version = version,
    )
}

class CustomerRepository(
    private val db: CoopDatabase,
    private val api: CoopApiService,
    private val syncEngine: SyncEngine,
    private val session: SessionManager,
) {
    fun observeCustomers(): Flow<List<CustomerOutDto>> =
        db.customerDao().observeAll().map { list -> list.map { it.toDto() } }

    suspend fun refreshFromRemote(): Result<List<CustomerOutDto>> {
        if (session.state.value.isDemoMode || !syncEngine.connectivity.isOnline.value) {
            return Result.success(db.customerDao().getAll().map { it.toDto() })
        }
        return runCatching {
            val res = api.listCustomers(page = 1, limit = 200)
            syncEngine.syncNow()
            res.items
        }
    }

    suspend fun getCustomer(id: Int): Result<CustomerOutDto> {
        val local = db.customerDao().getByIdOrServerId(id)
        if (local != null) return Result.success(local.toDto())
        return runCatching { api.getCustomer(id) }
    }

    suspend fun createCustomer(req: CustomerCreateDto): Result<CustomerOutDto> = runCatching {
        val now = Instant.now().toString()
        val cid = UlidGenerator.next()
        if (!session.state.value.isDemoMode && syncEngine.connectivity.isOnline.value) {
            val remote = api.createCustomer(req)
            db.customerDao().insert(
                CustomerEntity(
                    serverId = remote.id,
                    clientId = cid,
                    fullName = remote.fullName,
                    email = remote.email,
                    phone = remote.phone,
                    address = remote.address,
                    company = remote.company,
                    createdAt = remote.createdAt ?: now,
                    updatedAt = remote.updatedAt ?: now,
                ),
            )
            remote
        } else {
            val localId = db.customerDao().insert(
                CustomerEntity(
                    clientId = cid,
                    fullName = req.fullName.trim(),
                    email = req.email.trim(),
                    phone = req.phone?.trim(),
                    address = req.address?.trim(),
                    company = req.company?.trim(),
                    createdAt = now,
                    updatedAt = now,
                    pendingSync = !session.state.value.isDemoMode,
                ),
            ).toInt()
            if (!session.state.value.isDemoMode) {
                syncEngine.enqueueOutbox(
                    entity = "customer",
                    entityLocalId = localId,
                    clientId = cid,
                    operation = "create",
                    payload = buildJsonObject {
                        put("full_name", req.fullName.trim())
                        put("email", req.email.trim())
                        req.phone?.let { put("phone", it) }
                        req.address?.let { put("address", it) }
                        req.company?.let { put("company", it) }
                    },
                )
            }
            db.customerDao().getByIdOrServerId(localId)!!.toDto()
        }
    }

    suspend fun updateCustomer(id: Int, req: CustomerUpdateDto): Result<CustomerOutDto> = runCatching {
        val local = db.customerDao().getByIdOrServerId(id)
        val now = Instant.now().toString()
        if (!session.state.value.isDemoMode && syncEngine.connectivity.isOnline.value && (local?.serverId != null || local == null)) {
            val remote = api.updateCustomer(local?.serverId ?: id, req)
            if (local != null) {
                db.customerDao().update(
                    local.copy(
                        fullName = remote.fullName,
                        email = remote.email,
                        phone = remote.phone,
                        address = remote.address,
                        company = remote.company,
                        updatedAt = remote.updatedAt ?: now,
                    ),
                )
            }
            remote
        } else {
            val target = local ?: error("Customer not found offline")
            val updated = target.copy(
                fullName = req.fullName ?: target.fullName,
                email = req.email ?: target.email,
                phone = req.phone ?: target.phone,
                address = req.address ?: target.address,
                company = req.company ?: target.company,
                updatedAt = now,
                pendingSync = !session.state.value.isDemoMode,
            )
            db.customerDao().update(updated)
            if (!session.state.value.isDemoMode) {
                syncEngine.enqueueOutbox(
                    entity = "customer",
                    entityLocalId = target.id,
                    clientId = target.clientId,
                    operation = "update",
                    payload = buildJsonObject {
                        req.fullName?.let { put("full_name", it) }
                        req.email?.let { put("email", it) }
                        req.phone?.let { put("phone", it) }
                        req.address?.let { put("address", it) }
                        req.company?.let { put("company", it) }
                    },
                )
            }
            updated.toDto()
        }
    }

    suspend fun deleteCustomer(id: Int): Result<Unit> = runCatching {
        val local = db.customerDao().getByIdOrServerId(id)
        val now = Instant.now().toString()
        if (!session.state.value.isDemoMode && syncEngine.connectivity.isOnline.value && (local?.serverId != null || local == null)) {
            api.deleteCustomer(local?.serverId ?: id)
            if (local != null) db.customerDao().update(local.copy(deletedAt = now))
        } else if (local != null) {
            db.customerDao().update(local.copy(deletedAt = now, pendingSync = !session.state.value.isDemoMode))
            if (!session.state.value.isDemoMode) {
                syncEngine.enqueueOutbox(
                    entity = "customer",
                    entityLocalId = local.id,
                    clientId = local.clientId,
                    operation = "delete",
                    payload = buildJsonObject {},
                )
            }
        }
    }

    private fun CustomerEntity.toDto() = CustomerOutDto(
        id = serverId ?: id,
        fullName = fullName,
        email = email,
        phone = phone,
        address = address,
        company = company,
        createdAt = createdAt,
        updatedAt = updatedAt,
    )
}

class OrderRepository(
    private val db: CoopDatabase,
    private val api: CoopApiService,
    private val syncEngine: SyncEngine,
    private val session: SessionManager,
) {
    fun observeOrders(): Flow<List<OrderOutDto>> =
        db.orderDao().observeAll().map { list ->
            list.map { ord ->
                val items = db.orderDao().getItemsForOrder(ord.id)
                ord.toDto(items)
            }
        }

    suspend fun refreshFromRemote(): Result<List<OrderOutDto>> {
        if (session.state.value.isDemoMode || !syncEngine.connectivity.isOnline.value) {
            return Result.success(
                db.orderDao().getAll().map { it.toDto(db.orderDao().getItemsForOrder(it.id)) },
            )
        }
        return runCatching {
            val res = api.listOrders(page = 1, limit = 100)
            syncEngine.syncNow()
            res.items
        }
    }

    suspend fun getOrder(id: Int): Result<OrderOutDto> {
        if (!session.state.value.isDemoMode && syncEngine.connectivity.isOnline.value) {
            val remote = runCatching { api.getOrder(id) }.getOrNull()
            if (remote != null) return Result.success(remote)
        }
        val local = db.orderDao().getByIdOrServerId(id)
            ?: return Result.failure(NoSuchElementException("Order not found"))
        return Result.success(local.toDto(db.orderDao().getItemsForOrder(local.id)))
    }

    suspend fun createOrder(
        customerId: Int,
        lines: List<OrderItemCreateDto>,
        taxEnabled: Boolean = false,
        taxRate: Double = 0.0,
    ): Result<OrderOutDto> = runCatching {
        require(lines.isNotEmpty()) { "Add at least one line item." }
        val now = Instant.now().toString()
        val orderCid = UlidGenerator.next()

        if (!session.state.value.isDemoMode && syncEngine.connectivity.isOnline.value) {
            val remote = api.createOrder(OrderCreateDto(customerId = customerId, items = lines))
            syncEngine.syncNow()
            remote
        } else {
            val customer = db.customerDao().getByIdOrServerId(customerId)
            val totals = LocalOrderMath.computeTotals(
                lineAmounts = lines.map { it.quantity * it.unitPrice },
                taxEnabled = taxEnabled,
                taxRatePercent = taxRate,
            )
            var createdLocalId = 0
            db.withTransaction {
                createdLocalId = db.orderDao().insertOrder(
                    OrderEntity(
                        clientId = orderCid,
                        customerId = customer?.serverId ?: customerId,
                        customerServerId = customer?.serverId,
                        customerName = customer?.fullName ?: "Customer #$customerId",
                        status = "pending",
                        totalAmount = totals.subtotal,
                        taxRate = totals.taxRate,
                        taxAmount = totals.taxAmount,
                        grandTotal = totals.grandTotal,
                        amountPaid = 0.0,
                        balanceDue = totals.grandTotal,
                        paymentStatus = "unpaid",
                        orderDate = now,
                        createdAt = now,
                        updatedAt = now,
                        pendingSync = !session.state.value.isDemoMode,
                    ),
                ).toInt()
                for (line in lines) {
                    val prod = db.productDao().getByIdOrServerId(line.productId)
                    db.orderDao().insertOrderItem(
                        OrderItemEntity(
                            clientId = UlidGenerator.next(),
                            orderId = createdLocalId,
                            productId = prod?.serverId ?: line.productId,
                            productServerId = prod?.serverId,
                            productName = prod?.name,
                            quantity = line.quantity,
                            unitPrice = line.unitPrice,
                            totalPrice = LocalOrderMath.round2(line.quantity * line.unitPrice),
                            updatedAt = now,
                        ),
                    )
                }
            }
            if (!session.state.value.isDemoMode) {
                syncEngine.enqueueOutbox(
                    entity = "order",
                    entityLocalId = createdLocalId,
                    clientId = orderCid,
                    operation = "create",
                    payload = buildJsonObject {
                        if (customer != null) {
                            put("customer_client_id", customer.clientId)
                            customer.serverId?.let { put("customer_id", it) }
                        } else {
                            put("customer_id", customerId)
                        }
                        put("status", "pending")
                        putJsonArray("items") {
                            for (line in lines) {
                                val prod = db.productDao().getByIdOrServerId(line.productId)
                                add(
                                    buildJsonObject {
                                        if (prod != null) {
                                            put("product_client_id", prod.clientId)
                                            prod.serverId?.let { put("product_id", it) }
                                        } else {
                                            put("product_id", line.productId)
                                        }
                                        put("quantity", line.quantity)
                                        put("unit_price", line.unitPrice)
                                    },
                                )
                            }
                        }
                    },
                )
            }
            val saved = db.orderDao().getByIdOrServerId(createdLocalId)!!
            saved.toDto(db.orderDao().getItemsForOrder(saved.id))
        }
    }

    suspend fun updateOrderStatus(orderId: Int, nextStatus: String): Result<OrderOutDto> = runCatching {
        val local = db.orderDao().getByIdOrServerId(orderId)
        val now = Instant.now().toString()
        if (!session.state.value.isDemoMode && syncEngine.connectivity.isOnline.value && (local?.serverId != null || local == null)) {
            val remote = api.updateOrderStatus(local?.serverId ?: orderId, OrderStatusUpdateDto(nextStatus))
            if (local != null) {
                db.orderDao().updateOrder(local.copy(status = remote.status, updatedAt = now))
            }
            remote
        } else {
            val target = local ?: error("Order not found offline")
            require(LocalOrderMath.canTransition(target.status, nextStatus)) {
                "Cannot move order from ${target.status} to $nextStatus"
            }
            val updated = target.copy(status = nextStatus, updatedAt = now, pendingSync = !session.state.value.isDemoMode)
            db.orderDao().updateOrder(updated)
            if (!session.state.value.isDemoMode) {
                syncEngine.enqueueOutbox(
                    entity = "order",
                    entityLocalId = target.id,
                    clientId = target.clientId,
                    operation = "update",
                    payload = buildJsonObject { put("status", nextStatus) },
                )
            }
            updated.toDto(db.orderDao().getItemsForOrder(target.id))
        }
    }

    suspend fun deleteOrder(orderId: Int): Result<Unit> = runCatching {
        val local = db.orderDao().getByIdOrServerId(orderId)
        val now = Instant.now().toString()
        if (!session.state.value.isDemoMode && syncEngine.connectivity.isOnline.value && (local?.serverId != null || local == null)) {
            api.deleteOrder(local?.serverId ?: orderId)
            if (local != null) db.orderDao().updateOrder(local.copy(deletedAt = now))
        } else if (local != null) {
            db.orderDao().updateOrder(local.copy(deletedAt = now, pendingSync = !session.state.value.isDemoMode))
            if (!session.state.value.isDemoMode) {
                syncEngine.enqueueOutbox(
                    entity = "order",
                    entityLocalId = local.id,
                    clientId = local.clientId,
                    operation = "delete",
                    payload = buildJsonObject {},
                )
            }
        }
    }

    private fun OrderEntity.toDto(items: List<OrderItemEntity>): OrderOutDto = OrderOutDto(
        id = serverId ?: id,
        customerId = customerServerId ?: customerId,
        customer = customerName?.let { CustomerBriefDto(it) },
        status = status,
        allowedTransitions = LocalOrderMath.allowedNextStatuses(status),
        totalAmount = totalAmount,
        taxRate = taxRate,
        taxAmount = taxAmount,
        grandTotal = if (grandTotal > 0.0) grandTotal else totalAmount,
        amountPaid = amountPaid,
        balanceDue = if (balanceDue > 0.0 || paymentStatus == "paid") balanceDue else (if (grandTotal > 0.0) grandTotal else totalAmount),
        paymentStatus = paymentStatus,
        orderDate = orderDate,
        createdAt = createdAt,
        items = items.map {
            OrderItemOutDto(
                id = it.serverId ?: it.id,
                productId = it.productServerId ?: it.productId,
                quantity = it.quantity,
                unitPrice = it.unitPrice,
                totalPrice = it.totalPrice,
                productName = it.productName,
            )
        },
        invoiceNumber = invoiceNumber,
    )
}

class InvoiceReceivablesRepository(
    private val db: CoopDatabase,
    private val api: CoopApiService,
    private val session: SessionManager,
) {
    suspend fun getOrderPayments(orderId: Int): Result<OrderPaymentsResponseDto> = runCatching {
        if (session.state.value.isDemoMode) {
            val ord = db.orderDao().getByIdOrServerId(orderId)
            return@runCatching OrderPaymentsResponseDto(
                orderId = orderId,
                amountPaid = ord?.amountPaid ?: 0.0,
                balanceDue = ord?.balanceDue ?: 0.0,
                paymentStatus = ord?.paymentStatus ?: "unpaid",
            )
        }
        api.getOrderPayments(orderId)
    }

    suspend fun recordOrderPayment(orderId: Int, req: OrderPaymentCreateDto): Result<OrderPaymentsResponseDto> =
        runCatching {
            if (session.state.value.isDemoMode) {
                val ord = db.orderDao().getByIdOrServerId(orderId) ?: error("Order not found")
                val total = if (ord.grandTotal > 0) ord.grandTotal else ord.totalAmount
                val paid = LocalOrderMath.round2(ord.amountPaid + req.amount)
                require(paid <= total + 0.01) { "Payment exceeds balance due." }
                val balance = LocalOrderMath.round2((total - paid).coerceAtLeast(0.0))
                val pStatus = when {
                    balance <= 0.01 -> "paid"
                    paid > 0.0 -> "partial"
                    else -> "unpaid"
                }
                db.orderDao().updateOrder(ord.copy(amountPaid = paid, balanceDue = balance, paymentStatus = pStatus))
                OrderPaymentsResponseDto(orderId = orderId, amountPaid = paid, balanceDue = balance, paymentStatus = pStatus)
            } else {
                api.recordOrderPayment(orderId, req)
            }
        }

    suspend fun deleteOrderPayment(orderId: Int, paymentId: Int): Result<OrderPaymentsResponseDto> =
        runCatching {
            api.deleteOrderPayment(orderId, paymentId)
        }

    suspend fun listReceivables(): Result<ReceivablesResponseDto> = runCatching {
        if (session.state.value.isDemoMode) {
            val orders = db.orderDao().getAll()
                .filter { it.paymentStatus != "paid" && it.status != "cancelled" }
            val rows = orders.map { o ->
                val tot = if (o.grandTotal > 0) o.grandTotal else o.totalAmount
                ReceivableRowDto(
                    orderId = o.serverId ?: o.id,
                    customerId = o.customerId,
                    customerName = o.customerName,
                    orderDate = o.orderDate,
                    status = o.status,
                    subtotal = o.totalAmount,
                    taxAmount = o.taxAmount,
                    total = tot,
                    amountPaid = o.amountPaid,
                    balanceDue = o.balanceDue,
                    paymentStatus = o.paymentStatus,
                    ageDays = 0,
                )
            }
            ReceivablesResponseDto(
                items = rows,
                totalOutstanding = rows.sumOf { it.balanceDue },
                totalCollected = orders.sumOf { it.amountPaid },
                count = rows.size,
            )
        } else {
            api.listReceivables(limit = 100)
        }
    }

    suspend fun listInvoices(search: String? = null, status: String? = null): Result<InvoiceListResponseDto> =
        runCatching {
            if (session.state.value.isDemoMode) {
                val items = db.orderDao().getAll()
                    .filter { !it.invoiceNumber.isNullOrBlank() }
                    .map { o ->
                        InvoiceSummaryDto(
                            id = o.id,
                            number = o.invoiceNumber!!,
                            orderId = o.serverId ?: o.id,
                            customerId = o.customerId,
                            customerName = o.customerName,
                            status = "sent",
                            issueDate = o.orderDate,
                            totalAmount = o.totalAmount,
                            taxAmount = o.taxAmount,
                            grandTotal = if (o.grandTotal > 0) o.grandTotal else o.totalAmount,
                            amountPaid = o.amountPaid,
                            balanceDue = o.balanceDue,
                            paymentStatus = o.paymentStatus,
                        )
                    }
                InvoiceListResponseDto(items = items, total = items.size)
            } else {
                api.listInvoices(search = search, status = status, limit = 100)
            }
        }

    suspend fun createInvoice(orderId: Int, notes: String? = null): Result<InvoiceDetailDto> = runCatching {
        if (session.state.value.isDemoMode) {
            val ord = db.orderDao().getByIdOrServerId(orderId) ?: error("Order not found")
            val number = ord.invoiceNumber ?: "INV-${(ord.id).toString().padStart(4, '0')}"
            db.orderDao().updateOrder(ord.copy(invoiceNumber = number))
            InvoiceDetailDto(id = ord.id, number = number, orderId = orderId, status = "draft", notes = notes)
        } else {
            api.createInvoice(InvoiceCreateRequestDto(orderId = orderId, notes = notes))
        }
    }

    suspend fun updateInvoiceStatus(invoiceId: Int, status: String): Result<InvoiceDetailDto> = runCatching {
        api.updateInvoice(invoiceId, InvoiceUpdateRequestDto(status = status))
    }

    suspend fun exportInvoicesCsv(search: String? = null, status: String? = null): Result<String> = runCatching {
        val resp = api.exportInvoicesCsv(search = search, status = status)
        resp.body()?.string() ?: error("Empty export")
    }
}
