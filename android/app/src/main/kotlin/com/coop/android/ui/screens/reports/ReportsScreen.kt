package com.coop.android.ui.screens.reports

import android.content.Intent
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.coop.android.core.network.ApiErrorParser
import com.coop.android.core.network.dto.AiReportRefDto
import com.coop.android.core.network.dto.ReportDataDto
import com.coop.android.core.util.MoneyFormatter
import com.coop.android.data.repository.ReportRepository
import com.coop.android.ui.components.*
import com.coop.android.ui.theme.CoopSpacing
import com.coop.android.ui.theme.CoopThemeTokens
import com.coop.android.ui.theme.CoopType
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportsScreen(
    repo: ReportRepository,
    currency: String,
    onAskZenoAboutReport: (title: String, ref: AiReportRefDto) -> Unit,
    onBack: () -> Unit,
) {
    val palette = CoopThemeTokens.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val reportKeys = listOf(
        "sales" to "Sales",
        "profit_loss" to "P&L",
        "inventory" to "Inventory",
        "customers" to "Customers",
    )

    var selectedKey by remember { mutableStateOf("sales") }
    var periodDays by remember { mutableStateOf<Long?>(30L) }
    var fromDate by remember { mutableStateOf(LocalDate.now().minusDays(29)) }
    var toDate by remember { mutableStateOf(LocalDate.now()) }
    var pickingDateFor by remember { mutableStateOf<String?>(null) } // "from" or "to"
    var compare by remember { mutableStateOf("none") }
    var categories by remember { mutableStateOf<List<String>>(emptyList()) }
    var selectedCategory by remember { mutableStateOf<String?>(null) }
    var report by remember { mutableStateOf<ReportDataDto?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var exportMessage by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        repo.getMeta().onSuccess { meta -> categories = meta.categories }
    }

    fun load() {
        scope.launch {
            loading = true
            error = null
            repo.getReport(
                key = selectedKey,
                from = fromDate.toString(),
                to = toDate.toString(),
                compare = compare.takeIf { it != "none" },
                category = selectedCategory,
            ).onSuccess { report = it }
                .onFailure { error = ApiErrorParser.message(it) }
            loading = false
        }
    }

    fun export(format: String) {
        scope.launch {
            exportMessage = null
            repo.exportReportBytes(
                key = selectedKey,
                format = format,
                from = fromDate.toString(),
                to = toDate.toString(),
                compare = compare.takeIf { it != "none" },
                category = selectedCategory,
            ).onSuccess { bytes ->
                val dir = File(context.cacheDir, "exports").apply { mkdirs() }
                val file = File(dir, "coop_${selectedKey}_report.$format")
                file.writeBytes(bytes)
                val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
                val mime = when (format) {
                    "pdf" -> "application/pdf"
                    "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    else -> "text/csv"
                }
                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = mime
                    putExtra(Intent.EXTRA_STREAM, uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                context.startActivity(Intent.createChooser(intent, "Share ${format.uppercase()} Report"))
            }.onFailure {
                exportMessage = ApiErrorParser.message(it, "Export failed")
            }
        }
    }

    LaunchedEffect(selectedKey, fromDate, toDate, compare, selectedCategory) { load() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.surface),
    ) {
        TopAppBar(
            title = { Text("Reports & Exports", style = CoopType.titleMd) },
            navigationIcon = {
                IconButton(onClick = onBack) { Icon(Icons.Rounded.ArrowBack, contentDescription = "Back") }
            },
            actions = {
                IconButton(onClick = { export("csv") }) { Icon(Icons.Rounded.Share, contentDescription = "Export CSV") }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = palette.surfaceContainerLowest),
        )

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(CoopSpacing.md),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    reportKeys.forEach { (k, label) ->
                        FilterChip(
                            selected = selectedKey == k,
                            onClick = { selectedKey = k },
                            label = { Text(label) },
                        )
                    }
                }
            }

            item {
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    listOf(7L to "7d", 30L to "30d", 90L to "90d").forEach { (days, lbl) ->
                        FilterChip(
                            selected = periodDays == days,
                            onClick = {
                                periodDays = days
                                toDate = LocalDate.now()
                                fromDate = toDate.minusDays(days - 1)
                            },
                            label = { Text(lbl) },
                        )
                    }
                    FilterChip(
                        selected = periodDays == null,
                        onClick = { pickingDateFor = "from" },
                        label = { Text("$fromDate → $toDate") },
                    )
                    FilterChip(
                        selected = false,
                        onClick = { pickingDateFor = "to" },
                        label = { Text("End Date") },
                    )
                }
            }

            item {
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    listOf(
                        "none" to "No Compare",
                        "previous_period" to "Prev Period",
                        "previous_month" to "Prev Month",
                        "previous_year" to "Prev Year",
                    ).forEach { (cmpKey, cmpLabel) ->
                        FilterChip(
                            selected = compare == cmpKey,
                            onClick = { compare = cmpKey },
                            label = { Text(cmpLabel) },
                        )
                    }
                }
            }

            if (categories.isNotEmpty()) {
                item {
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        FilterChip(
                            selected = selectedCategory == null,
                            onClick = { selectedCategory = null },
                            label = { Text("All Categories") },
                        )
                        categories.forEach { cat ->
                            FilterChip(
                                selected = selectedCategory == cat,
                                onClick = { selectedCategory = if (selectedCategory == cat) null else cat },
                                label = { Text(cat) },
                            )
                        }
                    }
                }
            }

            if (exportMessage != null) {
                item { Text(exportMessage!!, style = CoopType.bodyCompact, color = palette.error) }
            }

            if (loading) {
                item { CoopLoader(label = "Running verified report...") }
            } else if (error != null) {
                item { CoopErrorState(message = error!!, onRetry = { load() }) }
            } else if (report != null) {
                val r = report!!
                item {
                    CoopSectionHeader(title = r.title, subtitle = r.periodLabel)
                }

                item {
                    CoopAiCard(title = "Ask Zeno about this report", badgeText = "Verified Context") {
                        Text(
                            text = "Ask what changed, what matters most, and what to investigate — grounded in this exact report.",
                            style = CoopType.bodyCompact,
                            color = palette.onSurfaceVariant,
                        )
                        Spacer(modifier = Modifier.height(10.dp))
                        CoopAiButton(
                            text = "Explain This Report",
                            modifier = Modifier.fillMaxWidth(),
                            onClick = {
                                onAskZenoAboutReport(
                                    r.title,
                                    AiReportRefDto(
                                        key = selectedKey,
                                        fromDate = fromDate.toString(),
                                        to = toDate.toString(),
                                        compare = compare.takeIf { it != "none" },
                                        category = selectedCategory,
                                    ),
                                )
                            },
                        )
                    }
                }

                // KPI Grid
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        r.kpis.chunked(2).forEach { pair ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                pair.forEach { kpi ->
                                    val prim = kpi.value as? JsonPrimitive
                                    val num = prim?.doubleOrNull
                                    val formatted = when (kpi.format) {
                                        "money" -> if (num != null) MoneyFormatter.formatCompact(num, currency) else (prim?.content ?: "-")
                                        "percent" -> if (num != null) "$num%" else (prim?.content ?: "-")
                                        else -> prim?.content ?: kpi.value.toString()
                                    }
                                    CoopKpiCard(
                                        label = kpi.label,
                                        value = formatted,
                                        trendText = kpi.changePercent?.let { "${if (it >= 0) "+" else ""}$it%" },
                                        trendTone = if ((kpi.changePercent ?: 0.0) >= 0) PillTone.SUCCESS else PillTone.WARNING,
                                        icon = Icons.Rounded.Analytics,
                                        modifier = Modifier.weight(1f),
                                    )
                                }
                                if (pair.size == 1) Spacer(modifier = Modifier.weight(1f))
                            }
                        }
                    }
                }

                // Chart
                val firstSeries = r.chart.series.firstOrNull()?.data.orEmpty()
                if (firstSeries.isNotEmpty()) {
                    item {
                        val maxV = firstSeries.maxOrNull()?.coerceAtLeast(1.0) ?: 1.0
                        CoopCard(modifier = Modifier.fillMaxWidth()) {
                            CoopSectionHeader(title = r.chart.series.first().name)
                            Spacer(modifier = Modifier.height(10.dp))
                            Canvas(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(130.dp),
                            ) {
                                val step = size.width / firstSeries.size.coerceAtLeast(1)
                                val bw = (step * 0.65f).coerceAtLeast(4.dp.toPx())
                                firstSeries.forEachIndexed { idx, v ->
                                    val bh = ((v / maxV).toFloat() * size.height * 0.85f).coerceAtLeast(3.dp.toPx())
                                    drawRoundRect(
                                        color = palette.primary,
                                        topLeft = Offset(idx * step + (step - bw) / 2f, size.height - bh),
                                        size = Size(bw, bh),
                                        cornerRadius = CornerRadius(4.dp.toPx(), 4.dp.toPx()),
                                    )
                                }
                            }
                        }
                    }
                }

                // Tables
                r.tables.forEach { table ->
                    item {
                        CoopCard(modifier = Modifier.fillMaxWidth()) {
                            CoopSectionHeader(title = table.title)
                            Spacer(modifier = Modifier.height(8.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                table.columns.take(3).forEach { col ->
                                    Text(
                                        text = col.uppercase(),
                                        style = CoopType.labelCaps,
                                        color = palette.outline,
                                        modifier = Modifier.weight(1f),
                                    )
                                }
                            }
                            HorizontalDivider(color = palette.borderSubtle, modifier = Modifier.padding(vertical = 6.dp))
                            table.rows.take(12).forEach { row ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 4.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    row.take(3).forEach { cell ->
                                        val txt = (cell as? JsonPrimitive)?.content ?: cell.toString()
                                        Text(
                                            text = txt,
                                            style = CoopType.bodyCompact.copy(fontWeight = FontWeight.Medium),
                                            color = palette.onSurface,
                                            modifier = Modifier.weight(1f),
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // Export bar
                item {
                    CoopCard(modifier = Modifier.fillMaxWidth()) {
                        CoopSectionHeader(title = "Export Exactly What's On Screen")
                        Spacer(modifier = Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            CoopPrimaryButton(
                                text = "CSV",
                                modifier = Modifier.weight(1f),
                                onClick = { export("csv") },
                            )
                            CoopSecondaryButton(
                                text = "Excel",
                                modifier = Modifier.weight(1f),
                                onClick = { export("xlsx") },
                            )
                            CoopSecondaryButton(
                                text = "PDF",
                                modifier = Modifier.weight(1f),
                                onClick = { export("pdf") },
                            )
                        }
                    }
                }
            }
        }
    }

    if (pickingDateFor != null) {
        val initialDate = if (pickingDateFor == "from") fromDate else toDate
        val state = rememberDatePickerState(
            initialSelectedDateMillis = initialDate.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
        )
        DatePickerDialog(
            onDismissRequest = { pickingDateFor = null },
            confirmButton = {
                CoopPrimaryButton(
                    text = "Apply",
                    onClick = {
                        state.selectedDateMillis?.let { ms ->
                            val picked = Instant.ofEpochMilli(ms).atZone(ZoneOffset.UTC).toLocalDate()
                            if (pickingDateFor == "from") {
                                fromDate = picked
                                if (fromDate.isAfter(toDate)) toDate = fromDate
                            } else {
                                toDate = picked
                                if (toDate.isBefore(fromDate)) fromDate = toDate
                            }
                            periodDays = null
                        }
                        pickingDateFor = null
                    },
                )
            },
            dismissButton = {
                CoopGhostButton(text = "Cancel", onClick = { pickingDateFor = null })
            },
        ) {
            DatePicker(state = state)
        }
    }
}
