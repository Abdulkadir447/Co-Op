package com.coop.android.ui.screens.ops

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.coop.android.core.network.ApiErrorParser
import com.coop.android.core.network.dto.InvoiceSummaryDto
import com.coop.android.core.network.dto.ReceivablesResponseDto
import com.coop.android.core.util.MoneyFormatter
import com.coop.android.data.repository.InvoiceReceivablesRepository
import com.coop.android.ui.components.*
import com.coop.android.ui.theme.CoopSpacing
import com.coop.android.ui.theme.CoopThemeTokens
import com.coop.android.ui.theme.CoopType
import kotlinx.coroutines.launch
import java.io.File

@Composable
fun InvoicesScreen(
    repo: InvoiceReceivablesRepository,
    currency: String,
    onOpenOrder: (Int) -> Unit,
    onBack: () -> Unit,
) {
    val palette = CoopThemeTokens.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var loading by remember { mutableStateOf(true) }
    var search by remember { mutableStateOf("") }
    var statusFilter by remember { mutableStateOf("all") }
    var invoices by remember { mutableStateOf<List<InvoiceSummaryDto>>(emptyList()) }
    var invoiceToVoid by remember { mutableStateOf<InvoiceSummaryDto?>(null) }
    var message by remember { mutableStateOf<String?>(null) }

    fun load() {
        scope.launch {
            loading = true
            repo.listInvoices(
                search = search.takeIf { it.isNotBlank() },
                status = statusFilter.takeIf { it != "all" },
            ).onSuccess { invoices = it.items }
                .onFailure { message = ApiErrorParser.message(it) }
            loading = false
        }
    }

    LaunchedEffect(statusFilter) { load() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.surface),
    ) {
        TopAppBar(
            title = { Text("Invoices", style = CoopType.titleMd) },
            navigationIcon = {
                IconButton(onClick = onBack) { Icon(Icons.Rounded.ArrowBack, contentDescription = "Back") }
            },
            actions = {
                IconButton(
                    onClick = {
                        scope.launch {
                            repo.exportInvoicesCsv(search.takeIf { it.isNotBlank() }, statusFilter.takeIf { it != "all" })
                                .onSuccess { csv ->
                                    val dir = File(context.cacheDir, "exports").apply { mkdirs() }
                                    val file = File(dir, "coop_invoices.csv")
                                    file.writeText(csv)
                                    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
                                    val intent = Intent(Intent.ACTION_SEND).apply {
                                        type = "text/csv"
                                        putExtra(Intent.EXTRA_STREAM, uri)
                                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                    }
                                    context.startActivity(Intent.createChooser(intent, "Share Invoices CSV"))
                                }
                                .onFailure { message = ApiErrorParser.message(it) }
                        }
                    },
                ) {
                    Icon(Icons.Rounded.Share, contentDescription = "Export CSV")
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = palette.surfaceContainerLowest),
        )

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(CoopSpacing.md),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                CoopSearchBar(
                    query = search,
                    onQueryChange = {
                        search = it
                        load()
                    },
                    placeholder = "Search invoice # or customer...",
                )
            }
            item {
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    listOf("all", "draft", "sent", "void").forEach { st ->
                        FilterChip(
                            selected = statusFilter == st,
                            onClick = { statusFilter = st },
                            label = { Text(st.replaceFirstChar { it.uppercase() }) },
                        )
                    }
                }
            }
            if (message != null) {
                item { Text(message!!, style = CoopType.bodyCompact, color = palette.primary) }
            }
            if (loading) {
                item { CoopLoader() }
            } else if (invoices.isEmpty()) {
                item {
                    CoopEmptyState(
                        title = "No invoices",
                        message = "Generate sequential tax invoices directly from any order.",
                        icon = Icons.Rounded.ReceiptLong,
                    )
                }
            } else {
                items(invoices, key = { it.id }) { inv ->
                    CoopCard(
                        modifier = Modifier.fillMaxWidth(),
                        onClick = { onOpenOrder(inv.orderId) },
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column {
                                Text(inv.number, style = CoopType.titleMd, color = palette.onSurface)
                                Text(
                                    inv.customerName ?: "Order #${inv.orderId}",
                                    style = CoopType.bodyCompact,
                                    color = palette.onSurfaceVariant,
                                )
                            }
                            CoopStatusPill(text = inv.status, tone = orderStatusTone(inv.status))
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                "Due: ${inv.dueDate?.take(10) ?: inv.issueDate?.take(10) ?: "On receipt"}",
                                style = CoopType.labelCaps.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Normal),
                                color = palette.outline,
                            )
                            Text(
                                MoneyFormatter.format(inv.grandTotal, currency),
                                style = CoopType.titleMd,
                                color = palette.onSurface,
                            )
                        }
                        if (inv.status != "void") {
                            Spacer(modifier = Modifier.height(8.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                if (inv.status == "draft") {
                                    CoopSecondaryButton(
                                        text = "Mark Sent",
                                        onClick = {
                                            scope.launch {
                                                repo.updateInvoiceStatus(inv.id, "sent")
                                                    .onSuccess { load() }
                                                    .onFailure { message = ApiErrorParser.message(it) }
                                            }
                                        },
                                    )
                                }
                                CoopGhostButton(
                                    text = "Void",
                                    textColor = palette.error,
                                    onClick = { invoiceToVoid = inv },
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    if (invoiceToVoid != null) {
        val inv = invoiceToVoid!!
        AlertDialog(
            onDismissRequest = { invoiceToVoid = null },
            title = { Text("Void ${inv.number}?", style = CoopType.sectionHeading) },
            text = {
                Text(
                    "The customer may already hold a copy. Voiding cannot be undone.",
                    style = CoopType.bodyCompact,
                )
            },
            confirmButton = {
                CoopDangerButton(
                    text = "Void Invoice",
                    onClick = {
                        scope.launch {
                            repo.updateInvoiceStatus(inv.id, "void")
                                .onSuccess {
                                    invoiceToVoid = null
                                    message = "${inv.number} voided."
                                    load()
                                }
                                .onFailure {
                                    invoiceToVoid = null
                                    message = ApiErrorParser.message(it)
                                }
                        }
                    },
                )
            },
            dismissButton = { CoopGhostButton(text = "Cancel", onClick = { invoiceToVoid = null }) },
        )
    }
}

@Composable
fun ReceivablesScreen(
    repo: InvoiceReceivablesRepository,
    currency: String,
    onOpenOrder: (Int) -> Unit,
    onBack: () -> Unit,
) {
    val palette = CoopThemeTokens.colors
    val scope = rememberCoroutineScope()
    var loading by remember { mutableStateOf(true) }
    var data by remember { mutableStateOf<ReceivablesResponseDto?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    fun load() {
        scope.launch {
            loading = true
            error = null
            repo.listReceivables()
                .onSuccess { data = it }
                .onFailure { error = ApiErrorParser.message(it) }
            loading = false
        }
    }

    LaunchedEffect(Unit) { load() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.surface),
    ) {
        TopAppBar(
            title = { Text("Receivables", style = CoopType.titleMd) },
            navigationIcon = {
                IconButton(onClick = onBack) { Icon(Icons.Rounded.ArrowBack, contentDescription = "Back") }
            },
            actions = {
                IconButton(onClick = { load() }) { Icon(Icons.Rounded.Refresh, contentDescription = "Refresh") }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = palette.surfaceContainerLowest),
        )

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(CoopSpacing.md),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (loading) {
                item { CoopLoader() }
            } else if (error != null) {
                item { CoopErrorState(message = error!!, onRetry = { load() }) }
            } else if (data != null) {
                val r = data!!
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        CoopKpiCard(
                            label = "Outstanding",
                            value = MoneyFormatter.formatCompact(r.totalOutstanding, currency),
                            subtitle = "${r.count} open orders",
                            icon = Icons.Rounded.AccountBalanceWallet,
                            iconTint = palette.warning,
                            modifier = Modifier.weight(1f),
                        )
                        CoopKpiCard(
                            label = "Collected",
                            value = MoneyFormatter.formatCompact(r.totalCollected, currency),
                            icon = Icons.Rounded.CheckCircle,
                            iconTint = palette.success,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
                if (r.items.isEmpty()) {
                    item {
                        CoopEmptyState(
                            title = "All caught up!",
                            message = "No unpaid or partially paid orders right now.",
                            icon = Icons.Rounded.CheckCircleOutline,
                        )
                    }
                } else {
                    items(r.items, key = { it.orderId }) { row ->
                        CoopCard(
                            modifier = Modifier.fillMaxWidth(),
                            onClick = { onOpenOrder(row.orderId) },
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        row.customerName ?: "Customer #${row.customerId}",
                                        style = CoopType.titleMd,
                                        color = palette.onSurface,
                                    )
                                    Text(
                                        "Order #${row.orderId} · ${row.ageDays}d old",
                                        style = CoopType.bodyCompact,
                                        color = palette.outline,
                                    )
                                }
                                CoopStatusPill(
                                    text = if (row.ageDays >= 30) "30+ Days" else row.paymentStatus,
                                    tone = if (row.ageDays >= 30) PillTone.CRITICAL else PillTone.WARNING,
                                )
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(
                                    "Total: ${MoneyFormatter.format(row.total, currency)}",
                                    style = CoopType.bodyCompact,
                                    color = palette.onSurfaceVariant,
                                )
                                Text(
                                    "Owed: ${MoneyFormatter.format(row.balanceDue, currency)}",
                                    style = CoopType.titleMd,
                                    color = palette.warning,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
