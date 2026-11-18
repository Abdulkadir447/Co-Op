package com.coop.android.core.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        ProductEntity::class,
        StockMovementEntity::class,
        CustomerEntity::class,
        OrderEntity::class,
        OrderItemEntity::class,
        SyncOutboxEntity::class,
        SyncMetaEntity::class,
    ],
    version = 1,
    exportSchema = true,
)
abstract class CoopDatabase : RoomDatabase() {
    abstract fun productDao(): ProductDao
    abstract fun stockMovementDao(): StockMovementDao
    abstract fun customerDao(): CustomerDao
    abstract fun orderDao(): OrderDao
    abstract fun syncOutboxDao(): SyncOutboxDao
    abstract fun syncMetaDao(): SyncMetaDao

    companion object {
        @Volatile
        private var instance: CoopDatabase? = null

        fun getInstance(context: Context): CoopDatabase {
            return instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    CoopDatabase::class.java,
                    "coop_mirror.db",
                )
                    .fallbackToDestructiveMigration()
                    .build()
                    .also { instance = it }
            }
        }
    }
}
