package com.coop.android.core.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface ProductDao {
    @Query("SELECT * FROM products WHERE deletedAt IS NULL ORDER BY name ASC")
    fun observeAll(): Flow<List<ProductEntity>>

    @Query("SELECT * FROM products WHERE deletedAt IS NULL ORDER BY name ASC")
    suspend fun getAll(): List<ProductEntity>

    @Query("SELECT * FROM products WHERE id = :id OR serverId = :id LIMIT 1")
    suspend fun getByIdOrServerId(id: Int): ProductEntity?

    @Query("SELECT * FROM products WHERE clientId = :clientId LIMIT 1")
    suspend fun getByClientId(clientId: String): ProductEntity?

    @Query("SELECT * FROM products WHERE serverId = :serverId LIMIT 1")
    suspend fun getByServerId(serverId: Int): ProductEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(product: ProductEntity): Long

    @Update
    suspend fun update(product: ProductEntity)

    @Query("DELETE FROM products WHERE id = :id")
    suspend fun hardDelete(id: Int)

    @Query("DELETE FROM products")
    suspend fun clearAll()
}

@Dao
interface StockMovementDao {
    @Query("SELECT * FROM stock_movements WHERE productId = :productId OR productServerId = :productId ORDER BY id DESC")
    suspend fun getForProduct(productId: Int): List<StockMovementEntity>

    @Query("SELECT * FROM stock_movements WHERE clientId = :clientId LIMIT 1")
    suspend fun getByClientId(clientId: String): StockMovementEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(movement: StockMovementEntity): Long

    @Query("DELETE FROM stock_movements")
    suspend fun clearAll()
}

@Dao
interface CustomerDao {
    @Query("SELECT * FROM customers WHERE deletedAt IS NULL ORDER BY fullName ASC")
    fun observeAll(): Flow<List<CustomerEntity>>

    @Query("SELECT * FROM customers WHERE deletedAt IS NULL ORDER BY fullName ASC")
    suspend fun getAll(): List<CustomerEntity>

    @Query("SELECT * FROM customers WHERE id = :id OR serverId = :id LIMIT 1")
    suspend fun getByIdOrServerId(id: Int): CustomerEntity?

    @Query("SELECT * FROM customers WHERE clientId = :clientId LIMIT 1")
    suspend fun getByClientId(clientId: String): CustomerEntity?

    @Query("SELECT * FROM customers WHERE serverId = :serverId LIMIT 1")
    suspend fun getByServerId(serverId: Int): CustomerEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(customer: CustomerEntity): Long

    @Update
    suspend fun update(customer: CustomerEntity)

    @Query("DELETE FROM customers WHERE id = :id")
    suspend fun hardDelete(id: Int)

    @Query("DELETE FROM customers")
    suspend fun clearAll()
}

@Dao
interface OrderDao {
    @Query("SELECT * FROM orders WHERE deletedAt IS NULL ORDER BY id DESC")
    fun observeAll(): Flow<List<OrderEntity>>

    @Query("SELECT * FROM orders WHERE deletedAt IS NULL ORDER BY id DESC")
    suspend fun getAll(): List<OrderEntity>

    @Query("SELECT * FROM orders WHERE id = :id OR serverId = :id LIMIT 1")
    suspend fun getByIdOrServerId(id: Int): OrderEntity?

    @Query("SELECT * FROM orders WHERE clientId = :clientId LIMIT 1")
    suspend fun getByClientId(clientId: String): OrderEntity?

    @Query("SELECT * FROM orders WHERE serverId = :serverId LIMIT 1")
    suspend fun getByServerId(serverId: Int): OrderEntity?

    @Query("SELECT * FROM order_items WHERE orderId = :orderId AND deletedAt IS NULL")
    suspend fun getItemsForOrder(orderId: Int): List<OrderItemEntity>

    @Query("SELECT * FROM order_items WHERE deletedAt IS NULL")
    suspend fun getAllItems(): List<OrderItemEntity>

    @Query("SELECT * FROM order_items WHERE clientId = :clientId LIMIT 1")
    suspend fun getItemByClientId(clientId: String): OrderItemEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrder(order: OrderEntity): Long

    @Update
    suspend fun updateOrder(order: OrderEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrderItem(item: OrderItemEntity): Long

    @Query("DELETE FROM orders WHERE id = :id")
    suspend fun hardDeleteOrder(id: Int)

    @Query("DELETE FROM order_items")
    suspend fun clearAllItems()

    @Query("DELETE FROM orders")
    suspend fun clearAllOrders()
}

@Dao
interface SyncOutboxDao {
    @Query("SELECT * FROM sync_outbox WHERE status IN ('pending', 'failed') ORDER BY id ASC")
    suspend fun getPending(): List<SyncOutboxEntity>

    @Query("SELECT * FROM sync_outbox WHERE status = 'conflict' ORDER BY id DESC")
    fun observeConflicts(): Flow<List<SyncOutboxEntity>>

    @Query("SELECT * FROM sync_outbox WHERE status = 'conflict' ORDER BY id DESC")
    suspend fun getConflicts(): List<SyncOutboxEntity>

    @Query("SELECT * FROM sync_outbox WHERE status IN ('pending', 'failed', 'conflict') ORDER BY id DESC")
    fun observeActiveQueue(): Flow<List<SyncOutboxEntity>>

    @Query("SELECT COUNT(*) FROM sync_outbox WHERE status IN ('pending', 'failed')")
    fun observePendingCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM sync_outbox WHERE status = 'conflict'")
    fun observeConflictCount(): Flow<Int>

    @Query("SELECT * FROM sync_outbox WHERE id = :id LIMIT 1")
    suspend fun getById(id: Long): SyncOutboxEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(op: SyncOutboxEntity): Long

    @Update
    suspend fun update(op: SyncOutboxEntity)

    @Query("DELETE FROM sync_outbox WHERE id = :id")
    suspend fun deleteById(id: Long)

    @Query("DELETE FROM sync_outbox")
    suspend fun clearAll()
}

@Dao
interface SyncMetaDao {
    @Query("SELECT value FROM sync_meta WHERE key = :key LIMIT 1")
    suspend fun get(key: String): String?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun set(entry: SyncMetaEntity)

    @Query("DELETE FROM sync_meta")
    suspend fun clearAll()
}
