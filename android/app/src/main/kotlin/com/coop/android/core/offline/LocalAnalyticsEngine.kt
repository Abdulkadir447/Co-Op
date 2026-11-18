package com.coop.android.core.offline

import com.coop.android.core.local.CustomerEntity
import com.coop.android.core.local.OrderEntity
import com.coop.android.core.local.OrderItemEntity
import com.coop.android.core.local.ProductEntity
import com.coop.android.core.network.dto.*
import com.coop.android.core.util.MoneyFormatter
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import kotlin.math.roundToLong

object LocalAnalyticsEngine {

    private fun parseDate(iso: String?): LocalDate? {
        if (iso.isNullOrBlank()) return null
        return try {
            LocalDate.parse(iso.take(10))
        } catch (_: Exception) {
            try {
                Instant.parse(iso).atZone(ZoneId.systemDefault()).toLocalDate()
            } catch (_: Exception) {
                null
            }
        }
    }

    private fun round2(v: Double): Double = (v * 100.0).roundToLong() / 100.0

    fun computeDashboardSummary(
        products: List<ProductEntity>,
        customers: List<CustomerEntity>,
        orders: List<OrderEntity>,
        items: List<OrderItemEntity>,
        today: LocalDate = LocalDate.now(),
    ): DashboardSummaryDto {
        val activeOrders = orders.filter { it.deletedAt == null && !it.status.equals("cancelled", ignoreCase = true) }
        val monthStart = today.withDayOfMonth(1)
        val prevMonthStart = monthStart.minusMonths(1)
        val prevMonthEnd = monthStart.minusDays(1)

        val todayOrders = activeOrders.filter { parseDate(it.orderDate ?: it.createdAt) == today }
        val monthOrders = activeOrders.filter {
            val d = parseDate(it.orderDate ?: it.createdAt)
            d != null && !d.isBefore(monthStart) && !d.isAfter(today)
        }
        val prevMonthOrders = activeOrders.filter {
            val d = parseDate(it.orderDate ?: it.createdAt)
            d != null && !d.isBefore(prevMonthStart) && !d.isAfter(prevMonthEnd)
        }

        val revToday = round2(todayOrders.sumOf { it.totalAmount })
        val revMonth = round2(monthOrders.sumOf { it.totalAmount })
        val revPrevMonth = round2(prevMonthOrders.sumOf { it.totalAmount })
        val growth = if (revPrevMonth > 0.0) round2(((revMonth - revPrevMonth) / revPrevMonth) * 100.0) else null

        val costByProductId = products.associate { (it.serverId ?: it.id) to (it.costPrice ?: 0.0) }
        val monthOrderIds = monthOrders.flatMap { listOfNotNull(it.id, it.serverId) }.toSet()
        val monthCost = items.filter { it.orderId in monthOrderIds }
            .sumOf { (costByProductId[it.productId] ?: 0.0) * it.quantity }
        val profitMonth = round2(revMonth - monthCost)

        val invValue = round2(products.sumOf { it.unitPrice * it.currentStock })
        val lowStock = products.count { it.currentStock in 1..it.reorderLevel }
        val outOfStock = products.count { it.currentStock <= 0 }
        val newCustomersMonth = customers.count {
            val d = parseDate(it.createdAt)
            d != null && !d.isBefore(monthStart)
        }

        return DashboardSummaryDto(
            revenueToday = revToday,
            ordersToday = todayOrders.size,
            revenueMonth = revMonth,
            ordersMonth = monthOrders.size,
            revenueGrowthPercent = growth,
            profitMonth = profitMonth,
            productsCount = products.size,
            inventoryValue = invValue,
            lowStockCount = lowStock,
            outOfStockCount = outOfStock,
            customersTotal = customers.size,
            customersNewMonth = newCustomersMonth,
        )
    }

    fun computeTimeseries(
        orders: List<OrderEntity>,
        days: Int = 30,
        today: LocalDate = LocalDate.now(),
    ): List<TimeseriesPointDto> {
        val start = today.minusDays((days - 1).toLong().coerceAtLeast(0L))
        val byDate = orders
            .filter { it.deletedAt == null && !it.status.equals("cancelled", ignoreCase = true) }
            .groupBy { parseDate(it.orderDate ?: it.createdAt) }

        return (0 until days).map { offset ->
            val d = start.plusDays(offset.toLong())
            val dayOrders = byDate[d].orEmpty()
            TimeseriesPointDto(
                date = d.toString(),
                revenue = round2(dayOrders.sumOf { it.totalAmount }),
                orders = dayOrders.size,
            )
        }
    }

    fun computeInventoryByCategory(products: List<ProductEntity>): List<CategoryValueDto> {
        return products
            .filter { it.deletedAt == null }
            .groupBy { it.category?.takeIf { c -> c.isNotBlank() } ?: "Uncategorized" }
            .map { (cat, list) ->
                CategoryValueDto(
                    category = cat,
                    value = round2(list.sumOf { it.unitPrice * it.currentStock }),
                )
            }
            .sortedByDescending { it.value }
    }

    fun computeTopProducts(
        products: List<ProductEntity>,
        orders: List<OrderEntity>,
        items: List<OrderItemEntity>,
        limit: Int = 5,
    ): List<TopProductItemDto> {
        val validOrderIds = orders
            .filter { it.deletedAt == null && !it.status.equals("cancelled", ignoreCase = true) }
            .flatMap { listOfNotNull(it.id, it.serverId) }
            .toSet()
        val productNames = products.associate { (it.serverId ?: it.id) to it.name }

        return items
            .filter { it.deletedAt == null && it.orderId in validOrderIds }
            .groupBy { it.productId }
            .map { (pid, list) ->
                TopProductItemDto(
                    productId = pid,
                    productName = list.firstNotNullOfOrNull { it.productName } ?: productNames[pid] ?: "Product #$pid",
                    totalQuantity = list.sumOf { it.quantity },
                    totalRevenue = round2(list.sumOf { it.totalPrice }),
                )
            }
            .sortedByDescending { it.totalRevenue }
            .take(limit)
    }

    fun computeInventorySummary(products: List<ProductEntity>): InventorySummaryDto {
        val live = products.filter { it.deletedAt == null }
        val categories = live.mapNotNull { it.category?.takeIf { c -> c.isNotBlank() } }.distinct().size
        return InventorySummaryDto(
            productsCount = live.size,
            inventoryValue = round2(live.sumOf { it.unitPrice * it.currentStock }),
            lowStockCount = live.count { it.currentStock in 1..it.reorderLevel },
            outOfStockCount = live.count { it.currentStock <= 0 },
            categoriesCount = categories,
        )
    }

    fun computeBriefing(
        products: List<ProductEntity>,
        customers: List<CustomerEntity>,
        orders: List<OrderEntity>,
        items: List<OrderItemEntity>,
        currency: String = "USD",
        today: LocalDate = LocalDate.now(),
    ): BriefingResponseDto {
        val insights = mutableListOf<BriefingInsightDto>()
        val summary = computeDashboardSummary(products, customers, orders, items, today)
        val topProducts = computeTopProducts(products, orders, items, limit = 3)

        // 1. Overview / revenue trend
        if (summary.ordersMonth > 0) {
            val growthStr = summary.revenueGrowthPercent?.let {
                val sign = if (it >= 0) "+" else ""
                " ($sign$it% vs last month)"
            } ?: ""
            insights += BriefingInsightDto(
                id = "revenue-month",
                kind = "revenue",
                severity = if ((summary.revenueGrowthPercent ?: 0.0) < -10.0) "warning" else "info",
                title = "Monthly Revenue Snapshot",
                body = "${MoneyFormatter.format(summary.revenueMonth, currency)} across ${summary.ordersMonth} orders this month$growthStr.",
                evidence = "Calculated locally from ${orders.size} mirrored orders.",
                link = "/reports",
            )
        }

        // 2. Top Product
        val top = topProducts.firstOrNull()
        if (top != null) {
            insights += BriefingInsightDto(
                id = "top-product",
                kind = "product",
                severity = "info",
                title = "Top Seller: ${top.productName}",
                body = "${top.totalQuantity} units sold generating ${MoneyFormatter.format(top.totalRevenue, currency)}.",
                evidence = "Ranked by total line-item revenue.",
                link = "/products",
            )
        }

        // 3. Stock Risk
        val outCount = summary.outOfStockCount
        val lowCount = summary.lowStockCount
        if (outCount > 0 || lowCount > 0) {
            val urgentProduct = products.firstOrNull { it.currentStock <= 0 }
                ?: products.firstOrNull { it.currentStock <= it.reorderLevel }
            insights += BriefingInsightDto(
                id = "stock-risk",
                kind = "inventory",
                severity = if (outCount > 0) "critical" else "warning",
                title = "$outCount Out of Stock · $lowCount Low Stock",
                body = "Restock ${urgentProduct?.name ?: "affected items"} soon to prevent missed sales.",
                evidence = "Compared current stock against each SKU's reorder level.",
                link = "/inventory",
            )
        }

        // 4. Quiet customer with follow-up draft action
        val activeOrders = orders.filter { it.deletedAt == null && !it.status.equals("cancelled", ignoreCase = true) }
        val latestOrderByCust = activeOrders.groupBy { it.customerId }
            .mapValues { (_, list) -> list.mapNotNull { parseDate(it.orderDate ?: it.createdAt) }.maxOrNull() }
        val quietCustomer = customers.firstOrNull { c ->
            val cid = c.serverId ?: c.id
            val last = latestOrderByCust[cid] ?: latestOrderByCust[c.id]
            last != null && ChronoUnit.DAYS.between(last, today) >= 30
        }
        if (quietCustomer != null) {
            val custId = quietCustomer.serverId ?: quietCustomer.id
            val lastDate = latestOrderByCust[custId] ?: latestOrderByCust[quietCustomer.id]
            val daysQuiet = if (lastDate != null) ChronoUnit.DAYS.between(lastDate, today) else 30
            insights += BriefingInsightDto(
                id = "quiet-customer-$custId",
                kind = "customer",
                severity = "warning",
                title = "Quiet Customer: ${quietCustomer.fullName}",
                body = "No orders placed in $daysQuiet days. Consider reaching out with a replenishment draft.",
                evidence = "Last order recorded $lastDate.",
                link = "/customers/$custId",
                action = BriefingActionDto(
                    type = "DRAFT_ORDER",
                    label = "Draft Follow-up Order",
                    customerId = custId,
                    customerName = quietCustomer.fullName,
                    productId = top?.productId,
                    productName = top?.productName,
                    quantity = 1,
                ),
            )
        }

        return BriefingResponseDto(
            asOf = today.toString(),
            insights = insights,
        )
    }

    fun computeReport(
        key: String,
        products: List<ProductEntity>,
        customers: List<CustomerEntity>,
        orders: List<OrderEntity>,
        items: List<OrderItemEntity>,
        from: LocalDate = LocalDate.now().minusDays(29),
        to: LocalDate = LocalDate.now(),
        category: String? = null,
    ): ReportDataDto {
        val periodLabel = "$from to $to"
        val liveProducts = products.filter {
            it.deletedAt == null && (category.isNullOrBlank() || it.category.equals(category, ignoreCase = true))
        }
        val productMap = products.associateBy { it.serverId ?: it.id }
        val liveOrders = orders.filter { o ->
            if (o.deletedAt != null || o.status.equals("cancelled", ignoreCase = true)) return@filter false
            val d = parseDate(o.orderDate ?: o.createdAt)
            d == null || (!d.isBefore(from) && !d.isAfter(to))
        }
        val validOrderIds = liveOrders.flatMap { listOfNotNull(it.id, it.serverId) }.toSet()
        val liveItems = items.filter { it.deletedAt == null && it.orderId in validOrderIds }

        return when (key) {
            "profit_loss" -> {
                val rev = round2(liveOrders.sumOf { it.totalAmount })
                val cogs = round2(liveItems.sumOf { (productMap[it.productId]?.costPrice ?: 0.0) * it.quantity })
                val grossProfit = round2(rev - cogs)
                val margin = if (rev > 0.0) round2((grossProfit / rev) * 100.0) else 0.0
                val ts = computeTimeseries(liveOrders, days = 14, today = to)
                ReportDataDto(
                    key = "profit_loss",
                    title = "Profit & Loss",
                    periodLabel = periodLabel,
                    kpis = listOf(
                        ReportKpiDto("revenue", "Revenue", JsonPrimitive(rev), "money"),
                        ReportKpiDto("cogs", "Cost of Goods", JsonPrimitive(cogs), "money", goodWhen = "down"),
                        ReportKpiDto("gross_profit", "Gross Profit", JsonPrimitive(grossProfit), "money"),
                        ReportKpiDto("margin", "Gross Margin", JsonPrimitive(margin), "percent"),
                    ),
                    chart = ReportChartDto(
                        kind = "line",
                        labels = ts.map { it.date.takeLast(5) },
                        series = listOf(ReportSeriesDto("Revenue", ts.map { it.revenue })),
                        money = true,
                    ),
                    tables = listOf(
                        ReportTableDto(
                            title = "Product Margin Breakdown",
                            columns = listOf("Product", "Units", "Revenue", "Est. Cost", "Profit"),
                            rows = liveItems.groupBy { it.productId }.map { (pid, list) ->
                                val p = productMap[pid]
                                val r = round2(list.sumOf { it.totalPrice })
                                val c = round2((p?.costPrice ?: 0.0) * list.sumOf { it.quantity })
                                listOf(
                                    JsonPrimitive(p?.name ?: "Product #$pid"),
                                    JsonPrimitive(list.sumOf { it.quantity }),
                                    JsonPrimitive(r),
                                    JsonPrimitive(c),
                                    JsonPrimitive(round2(r - c)),
                                )
                            },
                            numericCols = listOf(1, 2, 3, 4),
                        ),
                    ),
                    notes = listOf("Computed locally from mirrored orders and product cost prices."),
                )
            }

            "inventory" -> {
                val invVal = round2(liveProducts.sumOf { it.unitPrice * it.currentStock })
                val low = liveProducts.count { it.currentStock in 1..it.reorderLevel }
                val out = liveProducts.count { it.currentStock <= 0 }
                val byCat = computeInventoryByCategory(liveProducts)
                ReportDataDto(
                    key = "inventory",
                    title = "Inventory Valuation & Stock Risk",
                    periodLabel = "As of $to",
                    kpis = listOf(
                        ReportKpiDto("skus", "Active SKUs", JsonPrimitive(liveProducts.size), "number"),
                        ReportKpiDto("value", "Retail Value", JsonPrimitive(invVal), "money"),
                        ReportKpiDto("low_stock", "Low Stock", JsonPrimitive(low), "number", goodWhen = "down"),
                        ReportKpiDto("out_of_stock", "Out of Stock", JsonPrimitive(out), "number", goodWhen = "down"),
                    ),
                    chart = ReportChartDto(
                        kind = "bar",
                        labels = byCat.map { it.category },
                        series = listOf(ReportSeriesDto("Value", byCat.map { it.value })),
                        money = true,
                    ),
                    tables = listOf(
                        ReportTableDto(
                            title = "Inventory Valuation",
                            columns = listOf("SKU", "Product", "Category", "Stock", "Reorder", "Value"),
                            rows = liveProducts.map { p ->
                                listOf(
                                    JsonPrimitive(p.sku),
                                    JsonPrimitive(p.name),
                                    JsonPrimitive(p.category ?: "Uncategorized"),
                                    JsonPrimitive(p.currentStock),
                                    JsonPrimitive(p.reorderLevel),
                                    JsonPrimitive(round2(p.unitPrice * p.currentStock)),
                                )
                            },
                            numericCols = listOf(3, 4, 5),
                        ),
                    ),
                )
            }

            "customers" -> {
                val custById = customers.associateBy { it.serverId ?: it.id }
                val byCust = liveOrders.groupBy { it.customerId }
                val topSpend = byCust.map { (cid, list) ->
                    val c = custById[cid]
                    Triple(c?.fullName ?: list.firstOrNull()?.customerName ?: "Customer #$cid", list.size, round2(list.sumOf { it.totalAmount }))
                }.sortedByDescending { it.third }
                ReportDataDto(
                    key = "customers",
                    title = "Customer Performance",
                    periodLabel = periodLabel,
                    kpis = listOf(
                        ReportKpiDto("total_customers", "Customers", JsonPrimitive(customers.size), "number"),
                        ReportKpiDto("active_buyers", "Active Buyers", JsonPrimitive(byCust.size), "number"),
                        ReportKpiDto("orders", "Orders", JsonPrimitive(liveOrders.size), "number"),
                        ReportKpiDto("revenue", "Revenue", JsonPrimitive(round2(liveOrders.sumOf { it.totalAmount })), "money"),
                    ),
                    chart = ReportChartDto(
                        kind = "bar",
                        labels = topSpend.take(6).map { it.first },
                        series = listOf(ReportSeriesDto("Spend", topSpend.take(6).map { it.third })),
                        money = true,
                    ),
                    tables = listOf(
                        ReportTableDto(
                            title = "Customer Spend",
                            columns = listOf("Customer", "Orders", "Total Spend"),
                            rows = topSpend.map { (name, count, spend) ->
                                listOf(JsonPrimitive(name), JsonPrimitive(count), JsonPrimitive(spend))
                            },
                            numericCols = listOf(1, 2),
                        ),
                    ),
                )
            }

            else -> {
                val rev = round2(liveOrders.sumOf { it.totalAmount })
                val aov = if (liveOrders.isNotEmpty()) round2(rev / liveOrders.size) else 0.0
                val ts = computeTimeseries(liveOrders, days = 14, today = to)
                val top = computeTopProducts(liveProducts, liveOrders, liveItems, limit = 10)
                ReportDataDto(
                    key = "sales",
                    title = "Sales Performance",
                    periodLabel = periodLabel,
                    kpis = listOf(
                        ReportKpiDto("revenue", "Net Revenue", JsonPrimitive(rev), "money"),
                        ReportKpiDto("orders", "Orders", JsonPrimitive(liveOrders.size), "number"),
                        ReportKpiDto("aov", "Avg Order Value", JsonPrimitive(aov), "money"),
                        ReportKpiDto("delivered", "Delivered", JsonPrimitive(liveOrders.count { it.status == "delivered" }), "number"),
                    ),
                    chart = ReportChartDto(
                        kind = "line",
                        labels = ts.map { it.date.takeLast(5) },
                        series = listOf(ReportSeriesDto("Revenue", ts.map { it.revenue })),
                        money = true,
                    ),
                    tables = listOf(
                        ReportTableDto(
                            title = "Top Products",
                            columns = listOf("Product", "Units Sold", "Revenue"),
                            rows = top.map {
                                listOf(JsonPrimitive(it.productName), JsonPrimitive(it.totalQuantity), JsonPrimitive(it.totalRevenue))
                            },
                            numericCols = listOf(1, 2),
                        ),
                    ),
                )
            }
        }
    }

    /** Neutralize spreadsheet formula injection (=, +, -, @, tab, CR) matching backend/csvsafe.py. */
    fun csvSafeCell(raw: String): String {
        val needsPrefix = raw.isNotEmpty() && raw[0] in charArrayOf('=', '+', '-', '@', '\t', '\r')
        val safe = if (needsPrefix) "'$raw" else raw
        val escaped = safe.replace("\"", "\"\"")
        return "\"$escaped\""
    }

    fun exportReportCsv(report: ReportDataDto): String {
        val sb = StringBuilder()
        sb.appendLine(csvSafeCell(report.title) + "," + csvSafeCell(report.periodLabel))
        sb.appendLine()
        sb.appendLine("KPI,Value")
        for (kpi in report.kpis) {
            val v = (kpi.value as? JsonPrimitive)?.content ?: kpi.value.toString()
            sb.appendLine("${csvSafeCell(kpi.label)},${csvSafeCell(v)}")
        }
        for (table in report.tables) {
            sb.appendLine()
            sb.appendLine(csvSafeCell(table.title))
            sb.appendLine(table.columns.joinToString(",") { csvSafeCell(it) })
            for (row in table.rows) {
                sb.appendLine(
                    row.joinToString(",") { cell ->
                        val str = (cell as? JsonPrimitive)?.content ?: cell.toString()
                        csvSafeCell(str)
                    },
                )
            }
        }
        return sb.toString()
    }
}
