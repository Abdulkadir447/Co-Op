package com.coop.android.ui.screens.ops

import android.content.Context
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.coop.android.core.auth.WriteMatrix
import com.coop.android.core.network.ApiErrorParser
import com.coop.android.core.network.dto.*
import com.coop.android.core.util.MoneyFormatter
import com.coop.android.data.repository.InvoiceReceivablesRepository
import com.coop.android.data.repository.OrderRepository
import com.coop.android.data.repository.SettingsBackupRepository
import com.coop.android.ui.components.*
import com.coop.android.ui.theme.CoopSpacing
import com.coop.android.ui.theme.CoopThemeTokens
import com.coop.android.ui.theme.CoopType
import kotlinx.coroutines.launch

@Composable
fun OrderDetailScreen(
    orderId: Int,
    orderRepo: OrderRepository,
    invoiceReceivablesRepo: InvoiceReceivablesRepository,
    settingsRepo: SettingsBackupRepository,
    businessName: String,
    role: String,
    currency: String,
    onBack: () -> Unit,
) {
    val palette = CoopThemeTokens.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var loading by remember { mutableStateOf(true) }
    var order by remember { mutableStateOf<OrderOutDto?>(null) }
    var businessSettings by remember { mutableStateOf<BusinessSettingsOutDto?>(null) }
    var payments by remember { mutableStateOf<OrderPaymentsResponseDto?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var feedback by remember { mutableStateOf<String?>(null) }
    var showPaymentDialog by remember { mutableStateOf(false) }
    var showDeleteOrderDialog by remember { mutableStateOf(false) }
    var paymentToDelete by remember { mutableStateOf<OrderPaymentOutDto?>(null) }

    val canWriteOrders = WriteMatrix.canWrite(role, "/orders")
    val canWriteInvoices = WriteMatrix.canWrite(role, "/invoices")

    fun load() {
        scope.launch {
            loading = true
            error = null
            settingsRepo.getSettings().onSuccess { businessSettings = it }
            orderRepo.getOrder(orderId)
                .onSuccess { o ->
                    order = o
                    invoiceReceivablesRepo.getOrderPayments(orderId).onSuccess { payments = it }
                }
                .onFailure { error = ApiErrorParser.message(it, "Unable to load order") }
            loading = false
        }
    }

    LaunchedEffect(orderId) { load() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.surface),
    ) {
        TopAppBar(
            title = { Text("Order #$orderId", style = CoopType.titleMd) },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.Rounded.ArrowBack, contentDescription = "Back")
                }
            },
            actions = {
                if (order != null) {
                    IconButton(onClick = { printOrderInvoice(context, businessName, businessSettings, order!!, currency) }) {
                        Icon(Icons.Rounded.Print, contentDescription = "Print Invoice")
                    }
                    if (canWriteOrders) {
                        IconButton(onClick = { showDeleteOrderDialog = true }) {
                            Icon(Icons.Rounded.DeleteOutline, contentDescription = "Delete Order", tint = palette.error)
                        }
                    }
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = palette.surfaceContainerLowest),
        )

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(CoopSpacing.md),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (loading && order == null) {
                item { CoopLoader() }
            } else if (error != null && order == null) {
                item { CoopErrorState(message = error!!, onRetry = { load() }) }
            } else if (order != null) {
                val o = order!!
                val grand = o.grandTotal.takeIf { it > 0.0 } ?: o.totalAmount

                if (feedback != null) {
                    item {
                        CoopCard(backgroundColor = palette.surfaceContainerLow, contentPadding = 12.dp) {
                            Text(feedback!!, style = CoopType.bodyCompact, color = palette.primary)
                        }
                    }
                }

                // Header Summary
                item {
                    CoopCard(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column {
                                Text(
                                    text = o.customer?.fullName ?: "Customer #${o.customerId}",
                                    style = CoopType.sectionHeading,
                                    color = palette.onSurface,
                                )
                                Text(
                                    text = "Placed ${o.orderDate?.take(10) ?: "Today"}${o.invoiceNumber?.let { " · $it" } ?: ""}",
                                    style = CoopType.bodyCompact,
                                    color = palette.outline,
                                )
                            }
                            CoopStatusPill(text = o.status, tone = orderStatusTone(o.status))
                        }

                        if (canWriteOrders && o.allowedTransitions.isNotEmpty()) {
                            Spacer(modifier = Modifier.height(12.dp))
                            Text("MOVE STATUS", style = CoopType.labelCaps, color = palette.outline)
                            Spacer(modifier = Modifier.height(6.dp))
                            Row(
                                modifier = Modifier.horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                o.allowedTransitions.forEach { next ->
                                    if (next == "cancelled") {
                                        CoopDangerButton(
                                            text = "Cancel Order",
                                            onClick = {
                                                scope.launch {
                                                    orderRepo.updateOrderStatus(o.id, next)
                                                        .onSuccess {
                                                            order = it
                                                            feedback = "Order cancelled."
                                                        }
                                                        .onFailure { feedback = ApiErrorParser.message(it) }
                                                }
                                            },
                                        )
                                    } else {
                                        CoopPrimaryButton(
                                            text = "Mark ${next.replaceFirstChar { it.uppercase() }}",
                                            onClick = {
                                                scope.launch {
                                                    orderRepo.updateOrderStatus(o.id, next)
                                                        .onSuccess {
                                                            order = it
                                                            feedback = "Status updated to $next."
                                                        }
                                                        .onFailure { feedback = ApiErrorParser.message(it) }
                                                }
                                            },
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // Line Items
                item {
                    CoopCard(modifier = Modifier.fillMaxWidth()) {
                        CoopSectionHeader(title = "Items (${o.items.size})")
                        Spacer(modifier = Modifier.height(8.dp))
                        o.items.forEach { it ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 6.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(it.productName ?: "Product #${it.productId}", style = CoopType.bodyCompact.copy(fontWeight = FontWeight.SemiBold))
                                    Text("${it.quantity} × ${MoneyFormatter.format(it.unitPrice, currency)}", style = CoopType.labelCaps.copy(fontWeight = FontWeight.Normal), color = palette.outline)
                                }
                                Text(MoneyFormatter.format(it.totalPrice, currency), style = CoopType.bodyCompact.copy(fontWeight = FontWeight.SemiBold))
                            }
                        }
                        HorizontalDivider(color = palette.borderSubtle, modifier = Modifier.padding(vertical = 8.dp))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Subtotal", style = CoopType.bodyCompact, color = palette.onSurfaceVariant)
                            Text(MoneyFormatter.format(o.totalAmount, currency), style = CoopType.bodyCompact)
                        }
                        if (o.taxAmount > 0.0) {
                            val taxLbl = businessSettings?.taxLabel ?: "Tax"
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("$taxLbl (${o.taxRate ?: 0.0}%)", style = CoopType.bodyCompact, color = palette.onSurfaceVariant)
                                Text(MoneyFormatter.format(o.taxAmount, currency), style = CoopType.bodyCompact)
                            }
                        }
                        Spacer(modifier = Modifier.height(6.dp))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Grand Total", style = CoopType.titleMd)
                            Text(MoneyFormatter.format(grand, currency), style = CoopType.titleMd, color = palette.primary)
                        }
                    }
                }

                // Payments / Receivables
                item {
                    val paid = payments?.amountPaid ?: o.amountPaid
                    val balance = payments?.balanceDue ?: o.balanceDue
                    val payStatus = payments?.paymentStatus ?: o.paymentStatus
                    CoopCard(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            CoopSectionHeader(title = "Payments")
                            CoopStatusPill(text = payStatus, tone = orderStatusTone(payStatus))
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Amount Paid", style = CoopType.bodyCompact, color = palette.onSurfaceVariant)
                            Text(MoneyFormatter.format(paid, currency), style = CoopType.bodyCompact.copy(fontWeight = FontWeight.SemiBold))
                        }
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Balance Due", style = CoopType.bodyCompact, color = palette.onSurfaceVariant)
                            Text(
                                MoneyFormatter.format(balance, currency),
                                style = CoopType.titleMd,
                                color = if (balance > 0.0) palette.warning else palette.success,
                            )
                        }
                        if (canWriteOrders && o.status != "cancelled" && balance > 0.01) {
                            Spacer(modifier = Modifier.height(12.dp))
                            CoopPrimaryButton(
                                text = "Record Payment",
                                leadingIcon = Icons.Rounded.Payments,
                                modifier = Modifier.fillMaxWidth(),
                                onClick = { showPaymentDialog = true },
                            )
                        }
                    }
                }

                // Payment ledger rows
                val ledger = payments?.items.orEmpty()
                if (ledger.isNotEmpty()) {
                    items(ledger, key = { it.id }) { pay ->
                        CoopCard(backgroundColor = palette.surfaceContainerLow, contentPadding = 12.dp) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text("${pay.method.uppercase()} ${pay.reference ?: ""}", style = CoopType.bodyCompact.copy(fontWeight = FontWeight.SemiBold))
                                    pay.receivedAt?.let { Text(it.take(16), style = CoopType.labelCaps.copy(fontWeight = FontWeight.Normal), color = palette.outline) }
                                }
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text(MoneyFormatter.format(pay.amount, currency), style = CoopType.titleMd, color = palette.success)
                                    if (canWriteOrders) {
                                        IconButton(onClick = { paymentToDelete = pay }) {
                                            Icon(Icons.Rounded.DeleteOutline, contentDescription = "Reverse payment", tint = palette.error)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Invoice Actions
                item {
                    CoopCard(modifier = Modifier.fillMaxWidth()) {
                        CoopSectionHeader(
                            title = "Tax Invoice",
                            subtitle = o.invoiceNumber ?: "Not generated yet",
                        )
                        Spacer(modifier = Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (o.invoiceNumber == null && canWriteInvoices) {
                                CoopPrimaryButton(
                                    text = "Generate Invoice",
                                    leadingIcon = Icons.Rounded.ReceiptLong,
                                    modifier = Modifier.weight(1f),
                                    onClick = {
                                        scope.launch {
                                            invoiceReceivablesRepo.createInvoice(o.id)
                                                .onSuccess { inv ->
                                                    order = o.copy(invoiceNumber = inv.number)
                                                    feedback = "Invoice ${inv.number} generated."
                                                }
                                                .onFailure { feedback = ApiErrorParser.message(it) }
                                        }
                                    },
                                )
                            }
                            CoopSecondaryButton(
                                text = "Print / PDF",
                                leadingIcon = Icons.Rounded.Print,
                                modifier = Modifier.weight(1f),
                                onClick = { printOrderInvoice(context, businessName, businessSettings, o, currency) },
                            )
                        }
                    }
                }
            }
        }
    }

    if (showPaymentDialog && order != null) {
        val maxPay = (payments?.balanceDue ?: order!!.balanceDue).coerceAtLeast(0.0)
        var amountStr by remember { mutableStateOf(String.format(java.util.Locale.US, "%.2f", maxPay)) }
        var method by remember { mutableStateOf("transfer") }
        var reference by remember { mutableStateOf("") }

        AlertDialog(
            onDismissRequest = { showPaymentDialog = false },
            title = { Text("Record Payment", style = CoopType.sectionHeading) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    CoopTextField(
                        value = amountStr,
                        onValueChange = { amountStr = it },
                        label = "Amount",
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    )
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        listOf("cash", "transfer", "card", "pos", "other").forEach { m ->
                            FilterChip(selected = method == m, onClick = { method = m }, label = { Text(m.uppercase()) })
                        }
                    }
                    CoopTextField(value = reference, onValueChange = { reference = it }, label = "Reference (optional)")
                }
            },
            confirmButton = {
                CoopPrimaryButton(
                    text = "Save Payment",
                    onClick = {
                        val amt = amountStr.toDoubleOrNull() ?: return@CoopPrimaryButton
                        scope.launch {
                            invoiceReceivablesRepo.recordOrderPayment(
                                order!!.id,
                                OrderPaymentCreateDto(amount = amt, method = method, reference = reference.ifBlank { null }),
                            ).onSuccess {
                                payments = it
                                showPaymentDialog = false
                                feedback = "Payment recorded."
                            }.onFailure {
                                feedback = ApiErrorParser.message(it)
                            }
                        }
                    },
                )
            },
            dismissButton = { CoopGhostButton(text = "Cancel", onClick = { showPaymentDialog = false }) },
        )
    }
    if (showDeleteOrderDialog && order != null) {
        val o = order!!
        AlertDialog(
            onDismissRequest = { showDeleteOrderDialog = false },
            title = { Text("Delete Order #${o.id}?", style = CoopType.sectionHeading) },
            text = {
                Text(
                    text = "Are you sure you want to delete this order?${if (o.status != "cancelled") " Its stock will be restored." else ""}",
                    style = CoopType.bodyCompact,
                )
            },
            confirmButton = {
                CoopDangerButton(
                    text = "Delete Order",
                    onClick = {
                        scope.launch {
                            orderRepo.deleteOrder(o.id)
                                .onSuccess {
                                    showDeleteOrderDialog = false
                                    onBack()
                                }
                                .onFailure {
                                    showDeleteOrderDialog = false
                                    feedback = ApiErrorParser.message(it)
                                }
                        }
                    },
                )
            },
            dismissButton = {
                CoopGhostButton(text = "Keep Order", onClick = { showDeleteOrderDialog = false })
            },
        )
    }

    if (paymentToDelete != null && order != null) {
        val p = paymentToDelete!!
        AlertDialog(
            onDismissRequest = { paymentToDelete = null },
            title = { Text("Remove Payment?", style = CoopType.sectionHeading) },
            text = {
                Text(
                    "Remove ${MoneyFormatter.format(p.amount, currency)} (${p.method.uppercase()}) from Order #${order!!.id}? This action is audited.",
                    style = CoopType.bodyCompact,
                )
            },
            confirmButton = {
                CoopDangerButton(
                    text = "Remove Payment",
                    onClick = {
                        scope.launch {
                            invoiceReceivablesRepo.deleteOrderPayment(order!!.id, p.id)
                                .onSuccess {
                                    payments = it
                                    paymentToDelete = null
                                    feedback = "Payment removed."
                                    load()
                                }
                                .onFailure {
                                    paymentToDelete = null
                                    feedback = ApiErrorParser.message(it)
                                }
                        }
                    },
                )
            },
            dismissButton = {
                CoopGhostButton(text = "Cancel", onClick = { paymentToDelete = null })
            },
        )
    }
}

private fun printOrderInvoice(
    context: Context,
    businessName: String,
    settings: BusinessSettingsOutDto?,
    order: OrderOutDto,
    currency: String,
) {
    val rowsHtml = order.items.joinToString("") { item ->
        "<tr><td>${item.productName ?: "Product #${item.productId}"}</td>" +
            "<td style='text-align:right'>${item.quantity}</td>" +
            "<td style='text-align:right'>${MoneyFormatter.format(item.unitPrice, currency)}</td>" +
            "<td style='text-align:right'>${MoneyFormatter.format(item.totalPrice, currency)}</td></tr>"
    }
    val supplierName = settings?.name?.takeIf { it.isNotBlank() } ?: businessName.ifBlank { "Co-op Business" }
    val supplierMeta = buildList {
        settings?.address?.takeIf { it.isNotBlank() }?.let { add(it.replace("\n", "<br/>")) }
        settings?.phone?.takeIf { it.isNotBlank() }?.let { add(it) }
        settings?.taxId?.takeIf { it.isNotBlank() }?.let { add("Tax ID: $it") }
        settings?.registrationNumber?.takeIf { it.isNotBlank() }?.let { add("Reg. no.: $it") }
    }.joinToString("<br/>")
    val taxLabel = settings?.taxLabel?.takeIf { it.isNotBlank() } ?: "Tax"
    val grand = order.grandTotal.takeIf { it > 0 } ?: order.totalAmount
    val html = """
        <html><body style='font-family:sans-serif;padding:24px;color:#1b1b23'>
        <h2 style='margin-bottom:4px;color:#4143d5'>$supplierName</h2>
        ${if (supplierMeta.isNotBlank()) "<div style='font-size:12px;color:#464553;margin-bottom:12px'>$supplierMeta</div>" else ""}
        <p><strong>Invoice:</strong> ${order.invoiceNumber ?: "Order #${order.id}"}<br/>
        <strong>Customer:</strong> ${order.customer?.fullName ?: "Customer #${order.customerId}"}<br/>
        <strong>Date of supply:</strong> ${order.orderDate?.take(10) ?: ""}</p>
        <table style='width:100%;border-collapse:collapse;margin-top:16px' border='1' cellpadding='8'>
        <tr><th align='left'>Item</th><th align='right'>Qty</th><th align='right'>Price</th><th align='right'>Total</th></tr>
        $rowsHtml
        </table>
        <p style='text-align:right;margin-top:16px'>
        Subtotal: ${MoneyFormatter.format(order.totalAmount, currency)}<br/>
        ${if (order.taxRate != null) "$taxLabel (${order.taxRate}%): ${MoneyFormatter.format(order.taxAmount, currency)}<br/>" else ""}
        <strong>Grand Total: ${MoneyFormatter.format(grand, currency)}</strong><br/>
        Paid: ${MoneyFormatter.format(order.amountPaid, currency)} | Balance Due: ${MoneyFormatter.format(order.balanceDue, currency)}
        </p>
        </body></html>
    """.trimIndent()

    val webView = WebView(context)
    webView.webViewClient = object : WebViewClient() {
        override fun onPageFinished(view: WebView?, url: String?) {
            val pm = context.getSystemService(Context.PRINT_SERVICE) as PrintManager
            val adapter = view?.createPrintDocumentAdapter("Coop_Invoice_${order.id}") ?: return
            pm.print("Coop_Invoice_${order.id}", adapter, PrintAttributes.Builder().build())
        }
    }
    webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
}
