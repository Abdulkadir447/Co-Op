package com.coop.android

import com.coop.android.core.local.CustomerEntity
import com.coop.android.core.local.OrderEntity
import com.coop.android.core.local.OrderItemEntity
import com.coop.android.core.local.ProductEntity
import com.coop.android.core.offline.LocalAnalyticsEngine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class LocalAnalyticsEngineTest {

    private val today = LocalDate.of(2026, 11, 16)

    private val products = listOf(
        ProductEntity(id = 1, serverId = 1, clientId = "P1", sku = "SKU-1", name = "Espresso", category = "Coffee", unitPrice = 20.0, costPrice = 10.0, currentStock = 10, reorderLevel = 5),
        ProductEntity(id = 2, serverId = 2, clientId = "P2", sku = "SKU-2", name = "Matcha", category = "Tea", unitPrice = 30.0, costPrice = 15.0, currentStock = 0, reorderLevel = 5),
    )

    private val customers = listOf(
        CustomerEntity(id = 1, serverId = 1, clientId = "C1", fullName = "Ada Okafor", email = "ada@example.com", createdAt = today.minusDays(40).toString()),
    )

    private val orders = listOf(
        OrderEntity(id = 1, serverId = 1, clientId = "O1", customerId = 1, customerName = "Ada Okafor", status = "delivered", totalAmount = 100.0, grandTotal = 100.0, orderDate = today.toString(), createdAt = today.toString()),
        OrderEntity(id = 2, serverId = 2, clientId = "O2", customerId = 1, customerName = "Ada Okafor", status = "delivered", totalAmount = 60.0, grandTotal = 60.0, orderDate = today.minusDays(35).toString(), createdAt = today.minusDays(35).toString()),
    )

    private val items = listOf(
        OrderItemEntity(id = 1, clientId = "OI1", orderId = 1, productId = 1, productName = "Espresso", quantity = 5, unitPrice = 20.0, totalPrice = 100.0),
        OrderItemEntity(id = 2, clientId = "OI2", orderId = 2, productId = 2, productName = "Matcha", quantity = 2, unitPrice = 30.0, totalPrice = 60.0),
    )

    @Test
    fun `dashboard summary computes today month inventory and stock counts`() {
        val summary = LocalAnalyticsEngine.computeDashboardSummary(products, customers, orders, items, today)
        assertEquals(100.0, summary.revenueToday, 0.001)
        assertEquals(1, summary.ordersToday)
        assertEquals(100.0, summary.revenueMonth, 0.001)
        assertEquals(50.0, summary.profitMonth, 0.001)
        assertEquals(200.0, summary.inventoryValue, 0.001)
        assertEquals(1, summary.outOfStockCount)
        assertEquals(0, summary.lowStockCount)
    }

    @Test
    fun `briefing detects stock risk and report generates safe CSV`() {
        val briefing = LocalAnalyticsEngine.computeBriefing(products, customers, orders, items, "USD", today)
        assertTrue(briefing.insights.any { it.id == "stock-risk" && it.severity == "critical" })

        val report = LocalAnalyticsEngine.computeReport("sales", products, customers, orders, items, today.minusDays(40), today)
        assertEquals("sales", report.key)
        val csv = LocalAnalyticsEngine.exportReportCsv(report)
        assertTrue(csv.contains("Sales Performance"))

        assertEquals("\"'=SUM(A1:A2)\"", LocalAnalyticsEngine.csvSafeCell("=SUM(A1:A2)"))
        assertEquals("\"'@evil\"", LocalAnalyticsEngine.csvSafeCell("@evil"))
        assertEquals("\"Normal\"", LocalAnalyticsEngine.csvSafeCell("Normal"))
    }
}
