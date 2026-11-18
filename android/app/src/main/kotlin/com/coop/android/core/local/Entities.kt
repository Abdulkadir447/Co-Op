package com.coop.android.core.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "products",
    indices = [
        Index(value = ["clientId"], unique = true),
        Index(value = ["serverId"]),
        Index(value = ["sku"]),
    ],
)
data class ProductEntity(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val serverId: Int? = null,
    val clientId: String,
    val sku: String,
    val name: String,
    val description: String? = null,
    val category: String? = null,
    val unitPrice: Double,
    val costPrice: Double? = null,
    val currentStock: Int = 0,
    val reorderLevel: Int = 5,
    val version: Int = 1,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val deletedAt: String? = null,
    val pendingSync: Boolean = false,
)

@Entity(
    tableName = "stock_movements",
    indices = [
        Index(value = ["clientId"], unique = true),
        Index(value = ["productId"]),
    ],
)
data class StockMovementEntity(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val serverId: Int? = null,
    val clientId: String,
    val productId: Int,
    val productServerId: Int? = null,
    val change: Int,
    val reason: String,
    val note: String? = null,
    val orderId: Int? = null,
    val actor: String? = null,
    val createdAt: String? = null,
)

@Entity(
    tableName = "customers",
    indices = [
        Index(value = ["clientId"], unique = true),
        Index(value = ["serverId"]),
        Index(value = ["email"]),
    ],
)
data class CustomerEntity(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val serverId: Int? = null,
    val clientId: String,
    val fullName: String,
    val email: String,
    val phone: String? = null,
    val address: String? = null,
    val company: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val deletedAt: String? = null,
    val pendingSync: Boolean = false,
)

@Entity(
    tableName = "orders",
    indices = [
        Index(value = ["clientId"], unique = true),
        Index(value = ["serverId"]),
        Index(value = ["customerId"]),
    ],
)
data class OrderEntity(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val serverId: Int? = null,
    val clientId: String,
    val customerId: Int,
    val customerServerId: Int? = null,
    val customerName: String? = null,
    val status: String = "pending",
    val totalAmount: Double,
    val taxRate: Double? = null,
    val taxAmount: Double = 0.0,
    val grandTotal: Double = 0.0,
    val amountPaid: Double = 0.0,
    val balanceDue: Double = 0.0,
    val paymentStatus: String = "unpaid",
    val orderDate: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val deletedAt: String? = null,
    val invoiceNumber: String? = null,
    val pendingSync: Boolean = false,
)

@Entity(
    tableName = "order_items",
    indices = [
        Index(value = ["clientId"], unique = true),
        Index(value = ["orderId"]),
    ],
)
data class OrderItemEntity(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val serverId: Int? = null,
    val clientId: String,
    val orderId: Int,
    val productId: Int,
    val productServerId: Int? = null,
    val productName: String? = null,
    val quantity: Int,
    val unitPrice: Double,
    val totalPrice: Double,
    val updatedAt: String? = null,
    val deletedAt: String? = null,
)

@Entity(
    tableName = "sync_outbox",
    indices = [
        Index(value = ["status"]),
        Index(value = ["clientId"]),
    ],
)
data class SyncOutboxEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val entity: String,
    val entityLocalId: Int,
    val clientId: String,
    val operation: String,
    val payloadJson: String,
    val status: String = "pending", // pending | conflict | failed | resolved
    val conflictReason: String? = null,
    val conflictMessage: String? = null,
    val localSnapshotJson: String? = null,
    val serverSnapshotJson: String? = null,
    val attempts: Int = 0,
    val lastError: String? = null,
    val createdAt: String,
)

@Entity(tableName = "sync_meta")
data class SyncMetaEntity(
    @PrimaryKey val key: String,
    val value: String,
)
