package com.coop.android.ui.screens.dashboard

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.coop.android.core.network.ApiErrorParser
import com.coop.android.core.network.dto.*
import com.coop.android.core.sync.SyncStatusState
import com.coop.android.core.util.MoneyFormatter
import com.coop.android.data.repository.DashboardBriefingRepository
import com.coop.android.data.repository.OrderRepository
import com.coop.android.data.repository.ProductRepository
import com.coop.android.ui.components.*
import com.coop.android.ui.theme.CoopRadius
import com.coop.android.ui.theme.CoopSpacing
import com.coop.android.ui.theme.CoopThemeTokens
import com.coop.android.ui.theme.CoopType
import com.coop.android.ui.theme.tint
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

@Composable
fun DashboardScreen(
    repo: DashboardBriefingRepository,
    orderRepo: OrderRepository,
    productRepo: ProductRepository,
    syncStatus: SyncStatusState,
    currency: String,
    businessName: String,
    onCreateOrder: () -> Unit,
    onOpenOrder: (Int) -> Unit,
    onOpenBriefing: () -> Unit,
    onOpenAskZeno: () -> Unit,
    onOpenInventory: () -> Unit,
    onOpenReports: () -> Unit,
    onOpenSyncCenter: () -> Unit,
) {
    val palette = CoopThemeTokens.colors
    val scope = rememberCoroutineScope()
    val allOrders by orderRepo.observeOrders().collectAsState(initial = emptyList())
    val allProducts by productRepo.observeProducts().collectAsState(initial = emptyList())
    val recentOrders = remember(allOrders) { allOrders.take(5) }
    val lowStockItems = remember(allProducts) {
        allProducts.filter { it.currentStock <= it.reorderLevel }.sortedBy { it.currentStock }.take(5)
    }

    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var summary by remember { mutableStateOf<DashboardSummaryDto?>(null) }
    var timeseries by remember { mutableStateOf<List<TimeseriesPointDto>>(emptyList()) }
    var categories by remember { mutableStateOf<List<CategoryValueDto>>(emptyList()) }
    var topProducts by remember { mutableStateOf<List<TopProductItemDto>>(emptyList()) }

    fun loadAll() {
        scope.launch {
            loading = true
            error = null
            runCatching {
                coroutineScope {
                    val s = async { repo.getSummary() }
                    val t = async { repo.getTimeseries(14) }
                    val c = async { repo.getInventoryByCategory() }
                    val p = async { repo.getTopProducts(5) }
                    summary = s.await().getOrThrow()
                    timeseries = t.await().getOrDefault(emptyList())
                    categories = c.await().getOrDefault(emptyList())
                    topProducts = p.await().getOrDefault(emptyList())
                }
            }.onFailure { err ->
                error = ApiErrorParser.message(err, "Unable to load dashboard")
            }
            loading = false
        }
    }

    LaunchedEffect(Unit) { loadAll() }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.surface),
        contentPadding = PaddingValues(CoopSpacing.md),
        verticalArrangement = Arrangement.spacedBy(CoopSpacing.md),
    ) {
        if (!syncStatus.isOnline) {
            item {
                CoopOfflineBanner(
                    pendingCount = syncStatus.pendingCount,
                    conflictCount = syncStatus.conflictCount,
                    onClick = onOpenSyncCenter,
                )
            }
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = businessName.ifBlank { "Business Overview" },
                        style = CoopType.pageTitleMobile,
                        color = palette.onSurface,
                    )
                    Text(
                        text = "Live operational metrics & verified insights",
                        style = CoopType.bodyCompact,
                        color = palette.onSurfaceVariant,
                    )
                }
                IconButton(onClick = { loadAll() }) {
                    Icon(Icons.Rounded.Refresh, contentDescription = "Refresh", tint = palette.primary)
                }
            }
        }

        // Quick Actions strip
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                CoopPrimaryButton(
                    text = "New Order",
                    leadingIcon = Icons.Rounded.AddShoppingCart,
                    modifier = Modifier.weight(1f),
                    onClick = onCreateOrder,
                )
                CoopAiButton(
                    text = "Ask Zeno",
                    modifier = Modifier.weight(1f),
                    onClick = onOpenAskZeno,
                )
            }
        }

        if (loading && summary == null) {
            item { CoopLoader(label = "Loading business pulse...") }
        } else if (error != null && summary == null) {
            item { CoopErrorState(message = error!!, onRetry = { loadAll() }) }
        } else if (summary != null) {
            val s = summary!!

            // KPI Grid (2x2)
            item {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        CoopKpiCard(
                            label = "Revenue Today",
                            value = MoneyFormatter.formatCompact(s.revenueToday, currency),
                            subtitle = "${s.ordersToday} orders",
                            icon = Icons.Rounded.Payments,
                            iconTint = palette.primary,
                            modifier = Modifier.weight(1f),
                        )
                        CoopKpiCard(
                            label = "Month Revenue",
                            value = MoneyFormatter.formatCompact(s.revenueMonth, currency),
                            subtitle = "${s.ordersMonth} orders",
                            trendText = s.revenueGrowthPercent?.let { "${if (it >= 0) "+" else ""}${it}%" },
                            trendTone = if ((s.revenueGrowthPercent ?: 0.0) >= 0) PillTone.SUCCESS else PillTone.CRITICAL,
                            icon = Icons.Rounded.TrendingUp,
                            iconTint = palette.success,
                            modifier = Modifier.weight(1f),
                            onClick = onOpenReports,
                        )
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        CoopKpiCard(
                            label = "Inventory Value",
                            value = MoneyFormatter.formatCompact(s.inventoryValue, currency),
                            subtitle = "${s.productsCount} SKUs",
                            trendText = if (s.lowStockCount + s.outOfStockCount > 0) {
                                "${s.lowStockCount + s.outOfStockCount} alerts"
                            } else "Healthy",
                            trendTone = if (s.outOfStockCount > 0) PillTone.CRITICAL else if (s.lowStockCount > 0) PillTone.WARNING else PillTone.SUCCESS,
                            icon = Icons.Rounded.Inventory2,
                            iconTint = palette.warning,
                            modifier = Modifier.weight(1f),
                            onClick = onOpenInventory,
                        )
                        CoopKpiCard(
                            label = "Customers",
                            value = s.customersTotal.toString(),
                            subtitle = "+${s.customersNewMonth} this month",
                            icon = Icons.Rounded.People,
                            iconTint = palette.info,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }

            // Day 1 Briefing Banner Card
            item {
                CoopAiCard(
                    title = "Morning Briefing",
                    badgeText = "Verified",
                    onClick = onOpenBriefing,
                ) {
                    Text(
                        text = "Est. monthly gross profit ${MoneyFormatter.format(s.profitMonth, currency)}. Review stock risks, quiet customers & follow-up drafts.",
                        style = CoopType.bodyCompact,
                        color = palette.onSurfaceVariant,
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    CoopGhostButton(
                        text = "Open Day 1 Briefing",
                        leadingIcon = Icons.Rounded.ArrowForward,
                        onClick = onOpenBriefing,
                    )
                }
            }

            // Revenue Trend Chart
            if (timeseries.isNotEmpty()) {
                item {
                    CoopCard(modifier = Modifier.fillMaxWidth()) {
                        CoopSectionHeader(
                            title = "Revenue Trend (14d)",
                            subtitle = "Daily sales trajectory",
                            action = {
                                CoopGhostButton(text = "Reports", onClick = onOpenReports)
                            },
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        RevenueLineChart(
                            points = timeseries,
                            lineColor = palette.primary,
                            fillColor = palette.primaryContainer,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(150.dp),
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                text = timeseries.first().date.takeLast(5),
                                style = CoopType.labelCaps,
                                color = palette.outline,
                            )
                            Text(
                                text = "Peak ${MoneyFormatter.formatCompact(timeseries.maxOf { it.revenue }, currency)}",
                                style = CoopType.labelCaps,
                                color = palette.primary,
                            )
                            Text(
                                text = timeseries.last().date.takeLast(5),
                                style = CoopType.labelCaps,
                                color = palette.outline,
                            )
                        }
                    }
                }
            }

            // Top Products
            if (topProducts.isNotEmpty()) {
                item {
                    CoopCard(modifier = Modifier.fillMaxWidth()) {
                        CoopSectionHeader(title = "Top Products", subtitle = "By revenue")
                        Spacer(modifier = Modifier.height(12.dp))
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            topProducts.forEachIndexed { index, item ->
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                                        modifier = Modifier.weight(1f),
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .size(26.dp)
                                                .clip(RoundedCornerShape(CoopRadius.md))
                                                .background(palette.primaryFixed),
                                            contentAlignment = Alignment.Center,
                                        ) {
                                            Text(
                                                text = "${index + 1}",
                                                style = CoopType.labelCaps,
                                                color = palette.onPrimaryFixedVariant,
                                            )
                                        }
                                        Column {
                                            Text(
                                                text = item.productName,
                                                style = CoopType.bodyCompact.copy(fontWeight = FontWeight.SemiBold),
                                                color = palette.onSurface,
                                            )
                                            Text(
                                                text = "${item.totalQuantity} units sold",
                                                style = CoopType.labelCaps.copy(fontWeight = FontWeight.Normal),
                                                color = palette.outline,
                                            )
                                        }
                                    }
                                    Text(
                                        text = MoneyFormatter.format(item.totalRevenue, currency),
                                        style = CoopType.bodyCompact.copy(fontWeight = FontWeight.SemiBold),
                                        color = palette.onSurface,
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // Inventory by Category
            if (categories.isNotEmpty()) {
                val maxVal = categories.maxOf { it.value }.coerceAtLeast(1.0)
                item {
                    CoopCard(modifier = Modifier.fillMaxWidth()) {
                        CoopSectionHeader(title = "Inventory by Category", subtitle = "Retail valuation")
                        Spacer(modifier = Modifier.height(12.dp))
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            categories.forEach { cat ->
                                val fraction = (cat.value / maxVal).toFloat().coerceIn(0.05f, 1f)
                                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                    ) {
                                        Text(
                                            text = cat.category,
                                            style = CoopType.bodyCompact,
                                            color = palette.onSurface,
                                        )
                                        Text(
                                            text = MoneyFormatter.format(cat.value, currency),
                                            style = CoopType.bodyCompact.copy(fontWeight = FontWeight.SemiBold),
                                            color = palette.onSurface,
                                        )
                                    }
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(8.dp)
                                            .clip(RoundedCornerShape(CoopRadius.full))
                                            .background(palette.surfaceContainer),
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .fillMaxWidth(fraction)
                                                .fillMaxHeight()
                                                .clip(RoundedCornerShape(CoopRadius.full))
                                                .background(palette.primary),
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Recent Orders
            if (recentOrders.isNotEmpty()) {
                item {
                    CoopCard(modifier = Modifier.fillMaxWidth()) {
                        CoopSectionHeader(
                            title = "Recent Orders",
                            subtitle = "Latest activity",
                            action = {
                                CoopGhostButton(text = "View All", onClick = onOpenInventory)
                            },
                        )
                        Spacer(modifier = Modifier.height(10.dp))
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            recentOrders.forEach { ord ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(CoopRadius.md))
                                        .background(palette.surfaceContainerLow)
                                        .clickable { onOpenOrder(ord.id) }
                                        .padding(horizontal = 12.dp, vertical = 10.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = "Order #${ord.id} · ${ord.customer?.fullName ?: "Customer #${ord.customerId}"}",
                                            style = CoopType.bodyCompact.copy(fontWeight = FontWeight.SemiBold),
                                            color = palette.onSurface,
                                        )
                                        Text(
                                            text = "${ord.items.size} items · ${ord.orderDate?.take(10) ?: "Today"}",
                                            style = CoopType.labelCaps.copy(fontWeight = FontWeight.Normal),
                                            color = palette.outline,
                                        )
                                    }
                                    Column(horizontalAlignment = Alignment.End) {
                                        Text(
                                            text = MoneyFormatter.format(ord.grandTotal.takeIf { it > 0 } ?: ord.totalAmount, currency),
                                            style = CoopType.bodyCompact.copy(fontWeight = FontWeight.SemiBold),
                                            color = palette.onSurface,
                                        )
                                        CoopStatusPill(text = ord.status, tone = orderStatusTone(ord.status))
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Low Stock Alerts
            if (lowStockItems.isNotEmpty()) {
                item {
                    CoopCard(modifier = Modifier.fillMaxWidth()) {
                        CoopSectionHeader(
                            title = "Low & Out of Stock",
                            subtitle = "Items at or below reorder threshold",
                            action = {
                                CoopGhostButton(text = "Inventory", onClick = onOpenInventory)
                            },
                        )
                        Spacer(modifier = Modifier.height(10.dp))
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            lowStockItems.forEach { p ->
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(p.name, style = CoopType.bodyCompact.copy(fontWeight = FontWeight.SemiBold), color = palette.onSurface)
                                        Text("SKU ${p.sku} · Reorder at ${p.reorderLevel}", style = CoopType.labelCaps.copy(fontWeight = FontWeight.Normal), color = palette.outline)
                                    }
                                    CoopStatusPill(
                                        text = if (p.currentStock <= 0) "Out (0)" else "Low (${p.currentStock})",
                                        tone = if (p.currentStock <= 0) PillTone.CRITICAL else PillTone.WARNING,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RevenueLineChart(
    points: List<TimeseriesPointDto>,
    lineColor: Color,
    fillColor: Color,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier) {
        if (points.size < 2) return@Canvas
        val maxRev = points.maxOf { it.revenue }.coerceAtLeast(1.0)
        val w = size.width
        val h = size.height
        val stepX = w / (points.size - 1).coerceAtLeast(1)

        val linePath = Path()
        val areaPath = Path()

        points.forEachIndexed { idx, pt ->
            val x = idx * stepX
            val y = h - ((pt.revenue / maxRev).toFloat() * (h * 0.85f)) - (h * 0.05f)
            if (idx == 0) {
                linePath.moveTo(x, y)
                areaPath.moveTo(x, h)
                areaPath.lineTo(x, y)
            } else {
                linePath.lineTo(x, y)
                areaPath.lineTo(x, y)
            }
            if (idx == points.lastIndex) {
                areaPath.lineTo(x, h)
                areaPath.close()
            }
        }

        drawPath(
            path = areaPath,
            brush = Brush.verticalGradient(
                colors = listOf(fillColor.copy(alpha = 0.25f), Color.Transparent),
            ),
        )
        drawPath(
            path = linePath,
            color = lineColor,
            style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round),
        )
        points.forEachIndexed { idx, pt ->
            val x = idx * stepX
            val y = h - ((pt.revenue / maxRev).toFloat() * (h * 0.85f)) - (h * 0.05f)
            drawCircle(color = lineColor, radius = 3.5.dp.toPx(), center = Offset(x, y))
        }
    }
}
