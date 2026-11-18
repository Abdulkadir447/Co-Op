package com.coop.android.ui.screens.ops

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.coop.android.core.network.ApiErrorParser
import com.coop.android.core.network.dto.*
import com.coop.android.core.offline.LocalOrderMath
import com.coop.android.core.util.MoneyFormatter
import com.coop.android.data.repository.CustomerRepository
import com.coop.android.data.repository.OrderRepository
import com.coop.android.data.repository.ProductRepository
import com.coop.android.data.repository.SettingsBackupRepository
import com.coop.android.ui.components.*
import com.coop.android.ui.theme.CoopSpacing
import com.coop.android.ui.theme.CoopThemeTokens
import com.coop.android.ui.theme.CoopType
import kotlinx.coroutines.launch

data class DraftOrderLine(
    val product: ProductOutDto,
    val quantity: Int,
)

@Composable
fun CreateOrderScreen(
    customerRepo: CustomerRepository,
    productRepo: ProductRepository,
    orderRepo: OrderRepository,
    settingsRepo: SettingsBackupRepository,
    currency: String,
    prefillCustomerId: Int? = null,
    prefillProductId: Int? = null,
    prefillQuantity: Int? = null,
    onOrderCreated: (Int) -> Unit,
    onBack: () -> Unit,
) {
    val palette = CoopThemeTokens.colors
    val scope = rememberCoroutineScope()
    val customers by customerRepo.observeCustomers().collectAsState(initial = emptyList())
    val products by productRepo.observeProducts().collectAsState(initial = emptyList())

    var selectedCustomer by remember { mutableStateOf<CustomerOutDto?>(null) }
    var lines by remember { mutableStateOf<List<DraftOrderLine>>(emptyList()) }
    var showCustomerPicker by remember { mutableStateOf(false) }
    var showProductPicker by remember { mutableStateOf(false) }
    var taxEnabled by remember { mutableStateOf(false) }
    var taxRate by remember { mutableStateOf(0.0) }
    var taxLabel by remember { mutableStateOf("Tax") }
    var submitting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        customerRepo.refreshFromRemote()
        productRepo.refreshFromRemote()
        settingsRepo.getSettings().onSuccess {
            taxEnabled = it.taxEnabled
            taxRate = it.taxRate
            taxLabel = it.taxLabel
        }
    }

    LaunchedEffect(customers, prefillCustomerId) {
        if (selectedCustomer == null && prefillCustomerId != null) {
            selectedCustomer = customers.firstOrNull { it.id == prefillCustomerId }
        }
    }

    LaunchedEffect(products, prefillProductId) {
        if (lines.isEmpty() && prefillProductId != null) {
            val prod = products.firstOrNull { it.id == prefillProductId }
            if (prod != null) {
                lines = listOf(DraftOrderLine(prod, (prefillQuantity ?: 1).coerceAtLeast(1)))
            }
        }
    }

    val totals = remember(lines, taxEnabled, taxRate) {
        LocalOrderMath.computeTotals(
            lineAmounts = lines.map { it.product.unitPrice * it.quantity },
            taxEnabled = taxEnabled,
            taxRatePercent = taxRate,
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.surface),
    ) {
        TopAppBar(
            title = { Text("New Order", style = CoopType.titleMd) },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.Rounded.ArrowBack, contentDescription = "Back")
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = palette.surfaceContainerLowest),
        )

        LazyColumn(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentPadding = PaddingValues(CoopSpacing.md),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (error != null) {
                item {
                    CoopCard(backgroundColor = palette.error.copy(alpha = 0.08f)) {
                        Text(error!!, style = CoopType.bodyCompact, color = palette.error)
                    }
                }
            }

            item {
                CoopCard(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = { showCustomerPicker = true },
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column {
                            Text("CUSTOMER", style = CoopType.labelCaps, color = palette.outline)
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = selectedCustomer?.fullName ?: "Select a customer",
                                style = CoopType.titleMd,
                                color = if (selectedCustomer == null) palette.primary else palette.onSurface,
                            )
                            selectedCustomer?.email?.let {
                                Text(it, style = CoopType.bodyCompact, color = palette.onSurfaceVariant)
                            }
                        }
                        Icon(Icons.Rounded.ChevronRight, contentDescription = null, tint = palette.outline)
                    }
                }
            }

            item {
                CoopSectionHeader(
                    title = "Line Items",
                    action = {
                        CoopSecondaryButton(
                            text = "Add Item",
                            leadingIcon = Icons.Rounded.Add,
                            onClick = { showProductPicker = true },
                        )
                    },
                )
            }

            if (lines.isEmpty()) {
                item {
                    CoopEmptyState(
                        title = "No products added",
                        message = "Tap Add Item to add products from your catalog.",
                        icon = Icons.Rounded.AddShoppingCart,
                        actionLabel = "Add Product",
                        onAction = { showProductPicker = true },
                    )
                }
            } else {
                items(lines, key = { it.product.id }) { line ->
                    CoopCard(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(line.product.name, style = CoopType.titleMd, color = palette.onSurface)
                                Text(
                                    text = "${MoneyFormatter.format(line.product.unitPrice, currency)} each · ${line.product.currentStock} available",
                                    style = CoopType.bodyCompact,
                                    color = palette.outline,
                                )
                            }
                            IconButton(
                                onClick = { lines = lines.filterNot { it.product.id == line.product.id } },
                            ) {
                                Icon(Icons.Rounded.DeleteOutline, contentDescription = "Remove", tint = palette.error)
                            }
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                OutlinedIconButton(
                                    onClick = {
                                        if (line.quantity > 1) {
                                            lines = lines.map {
                                                if (it.product.id == line.product.id) it.copy(quantity = it.quantity - 1) else it
                                            }
                                        }
                                    },
                                ) {
                                    Icon(Icons.Rounded.Remove, contentDescription = "Decrease")
                                }
                                Text(
                                    text = "${line.quantity}",
                                    style = CoopType.titleMd,
                                    color = palette.onSurface,
                                )
                                OutlinedIconButton(
                                    onClick = {
                                        lines = lines.map {
                                            if (it.product.id == line.product.id) it.copy(quantity = it.quantity + 1) else it
                                        }
                                    },
                                ) {
                                    Icon(Icons.Rounded.Add, contentDescription = "Increase")
                                }
                            }
                            Text(
                                text = MoneyFormatter.format(line.product.unitPrice * line.quantity, currency),
                                style = CoopType.titleMd,
                                color = palette.onSurface,
                            )
                        }
                    }
                }
            }

            item {
                CoopCard(modifier = Modifier.fillMaxWidth(), backgroundColor = palette.surfaceContainerLow) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Subtotal", style = CoopType.bodyCompact, color = palette.onSurfaceVariant)
                        Text(MoneyFormatter.format(totals.subtotal, currency), style = CoopType.bodyCompact)
                    }
                    if (totals.taxRate != null) {
                        Spacer(modifier = Modifier.height(4.dp))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("$taxLabel (${totals.taxRate}%)", style = CoopType.bodyCompact, color = palette.onSurfaceVariant)
                            Text(MoneyFormatter.format(totals.taxAmount, currency), style = CoopType.bodyCompact)
                        }
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    HorizontalDivider(color = palette.borderSubtle)
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Grand Total", style = CoopType.titleMd, color = palette.onSurface)
                        Text(
                            MoneyFormatter.format(totals.grandTotal, currency),
                            style = CoopType.sectionHeading.copy(fontWeight = FontWeight.Bold),
                            color = palette.primary,
                        )
                    }
                }
            }
        }

        Surface(color = palette.surfaceContainerLowest, tonalElevation = 2.dp) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(CoopSpacing.md),
            ) {
                CoopPrimaryButton(
                    text = "Place Order",
                    leadingIcon = Icons.Rounded.Check,
                    loading = submitting,
                    enabled = selectedCustomer != null && lines.isNotEmpty(),
                    modifier = Modifier.fillMaxWidth(),
                    onClick = {
                        val cust = selectedCustomer ?: return@CoopPrimaryButton
                        submitting = true
                        error = null
                        scope.launch {
                            orderRepo.createOrder(
                                customerId = cust.id,
                                lines = lines.map {
                                    OrderItemCreateDto(
                                        productId = it.product.id,
                                        quantity = it.quantity,
                                        unitPrice = it.product.unitPrice,
                                    )
                                },
                                taxEnabled = taxEnabled,
                                taxRate = taxRate,
                            ).onSuccess { created ->
                                submitting = false
                                onOrderCreated(created.id)
                            }.onFailure { err ->
                                submitting = false
                                error = ApiErrorParser.message(err, "Failed to create order")
                            }
                        }
                    },
                )
            }
        }
    }

    if (showCustomerPicker) {
        ModalBottomSheet(onDismissRequest = { showCustomerPicker = false }) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(CoopSpacing.md)
                    .navigationBarsPadding(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text("Select Customer", style = CoopType.sectionHeading)
                customers.forEach { c ->
                    ListItem(
                        headlineContent = { Text(c.fullName) },
                        supportingContent = { Text(c.email) },
                        modifier = Modifier.clickable {
                            selectedCustomer = c
                            showCustomerPicker = false
                        },
                    )
                }
            }
        }
    }

    if (showProductPicker) {
        ModalBottomSheet(onDismissRequest = { showProductPicker = false }) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(CoopSpacing.md)
                    .navigationBarsPadding(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text("Add Product", style = CoopType.sectionHeading)
                products.forEach { p ->
                    ListItem(
                        headlineContent = { Text(p.name) },
                        supportingContent = { Text("${p.sku} · ${MoneyFormatter.format(p.unitPrice, currency)} · Stock: ${p.currentStock}") },
                        modifier = Modifier.clickable {
                            val existing = lines.firstOrNull { it.product.id == p.id }
                            lines = if (existing != null) {
                                lines.map { if (it.product.id == p.id) it.copy(quantity = it.quantity + 1) else it }
                            } else {
                                lines + DraftOrderLine(p, 1)
                            }
                            showProductPicker = false
                        },
                    )
                }
            }
        }
    }
}
