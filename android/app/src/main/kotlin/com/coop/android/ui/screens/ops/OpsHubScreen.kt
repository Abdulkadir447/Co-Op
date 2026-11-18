package com.coop.android.ui.screens.ops

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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.coop.android.core.auth.WriteMatrix
import com.coop.android.core.network.ApiErrorParser
import com.coop.android.core.network.dto.*
import com.coop.android.core.util.MoneyFormatter
import com.coop.android.data.repository.OrderRepository
import com.coop.android.data.repository.ProductRepository
import com.coop.android.ui.components.*
import com.coop.android.ui.theme.CoopSpacing
import com.coop.android.ui.theme.CoopThemeTokens
import com.coop.android.ui.theme.CoopType
import kotlinx.coroutines.launch

enum class OpsSection(val label: String) {
    ORDERS("Orders"),
    PRODUCTS("Products"),
    INVENTORY("Inventory"),
}

@Composable
fun OpsHubScreen(
    productRepo: ProductRepository,
    orderRepo: OrderRepository,
    role: String,
    currency: String,
    initialSection: OpsSection = OpsSection.ORDERS,
    onCreateOrder: () -> Unit,
    onOpenOrder: (Int) -> Unit,
    onOpenInvoices: () -> Unit,
    onOpenReceivables: () -> Unit,
    onOpenImport: () -> Unit,
) {
    val palette = CoopThemeTokens.colors
    var selectedSection by remember { mutableStateOf(initialSection) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.surface),
    ) {
        // Header + Sub-module chips
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(palette.surfaceContainerLowest)
                .padding(horizontal = CoopSpacing.md, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Operations", style = CoopType.pageTitleMobile, color = palette.onSurface)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    FilterChip(
                        selected = false,
                        onClick = onOpenInvoices,
                        label = { Text("Invoices") },
                        leadingIcon = { Icon(Icons.Rounded.ReceiptLong, contentDescription = null, modifier = Modifier.size(16.dp)) },
                    )
                    FilterChip(
                        selected = false,
                        onClick = onOpenReceivables,
                        label = { Text("Receivables") },
                    )
                    FilterChip(
                        selected = false,
                        onClick = onOpenImport,
                        label = { Text("Import") },
                    )
                }
            }

            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                OpsSection.entries.forEachIndexed { idx, section ->
                    SegmentedButton(
                        selected = selectedSection == section,
                        onClick = { selectedSection = section },
                        shape = SegmentedButtonDefaults.itemShape(index = idx, count = OpsSection.entries.size),
                        label = { Text(section.label) },
                    )
                }
            }
        }
        HorizontalDivider(color = palette.borderSubtle)

        when (selectedSection) {
            OpsSection.ORDERS -> OrdersSection(
                orderRepo = orderRepo,
                canWrite = WriteMatrix.canWrite(role, "/orders"),
                currency = currency,
                onCreateOrder = onCreateOrder,
                onOpenOrder = onOpenOrder,
            )

            OpsSection.PRODUCTS -> ProductsSection(
                productRepo = productRepo,
                canWrite = WriteMatrix.canWrite(role, "/products"),
                currency = currency,
            )

            OpsSection.INVENTORY -> InventorySection(
                productRepo = productRepo,
                canWrite = WriteMatrix.canWrite(role, "/inventory"),
                currency = currency,
            )
        }
    }
}

@Composable
private fun OrdersSection(
    orderRepo: OrderRepository,
    canWrite: Boolean,
    currency: String,
    onCreateOrder: () -> Unit,
    onOpenOrder: (Int) -> Unit,
) {
    val palette = CoopThemeTokens.colors
    val scope = rememberCoroutineScope()
    val orders by orderRepo.observeOrders().collectAsState(initial = emptyList())
    var search by remember { mutableStateOf("") }
    var statusFilter by remember { mutableStateOf("all") }
    var refreshing by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        refreshing = true
        orderRepo.refreshFromRemote()
        refreshing = false
    }

    val filtered = remember(orders, search, statusFilter) {
        orders.filter { o ->
            val matchStatus = statusFilter == "all" || o.status.equals(statusFilter, ignoreCase = true)
            val q = search.trim()
            val matchSearch = q.isBlank() ||
                o.id.toString().contains(q) ||
                (o.customer?.fullName?.contains(q, ignoreCase = true) == true) ||
                (o.invoiceNumber?.contains(q, ignoreCase = true) == true)
            matchStatus && matchSearch
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(CoopSpacing.md),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                CoopSearchBar(
                    query = search,
                    onQueryChange = { search = it },
                    placeholder = "Search order #, customer, invoice...",
                )
            }
            item {
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    listOf("all", "pending", "confirmed", "shipped", "delivered", "cancelled").forEach { st ->
                        FilterChip(
                            selected = statusFilter == st,
                            onClick = { statusFilter = st },
                            label = { Text(st.replaceFirstChar { it.uppercase() }) },
                        )
                    }
                }
            }
            if (refreshing && orders.isEmpty()) {
                item { CoopLoader(label = "Loading orders...") }
            } else if (filtered.isEmpty()) {
                item {
                    CoopEmptyState(
                        title = "No orders found",
                        message = "Create your first customer order to start tracking fulfillment and payments.",
                        icon = Icons.Rounded.ShoppingBag,
                        actionLabel = if (canWrite) "Create Order" else null,
                        onAction = if (canWrite) onCreateOrder else null,
                    )
                }
            } else {
                items(filtered, key = { it.id }) { order ->
                    CoopCard(
                        modifier = Modifier.fillMaxWidth(),
                        onClick = { onOpenOrder(order.id) },
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "Order #${order.id}${order.invoiceNumber?.let { " · $it" } ?: ""}",
                                    style = CoopType.titleMd,
                                    color = palette.onSurface,
                                )
                                Text(
                                    text = order.customer?.fullName ?: "Customer #${order.customerId}",
                                    style = CoopType.bodyCompact,
                                    color = palette.onSurfaceVariant,
                                )
                            }
                            CoopStatusPill(text = order.status, tone = orderStatusTone(order.status))
                        }
                        Spacer(modifier = Modifier.height(10.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = "${order.items.size} items · ${order.orderDate?.take(10) ?: "Today"}",
                                style = CoopType.labelCaps.copy(fontWeight = FontWeight.Normal),
                                color = palette.outline,
                            )
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                CoopStatusPill(
                                    text = order.paymentStatus,
                                    tone = orderStatusTone(order.paymentStatus),
                                )
                                Text(
                                    text = MoneyFormatter.format(order.grandTotal.takeIf { it > 0 } ?: order.totalAmount, currency),
                                    style = CoopType.titleMd,
                                    color = palette.onSurface,
                                )
                            }
                        }
                    }
                }
            }
            item { Spacer(modifier = Modifier.height(72.dp)) }
        }

        if (canWrite) {
            FloatingActionButton(
                onClick = onCreateOrder,
                containerColor = palette.primary,
                contentColor = palette.onPrimary,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(CoopSpacing.md),
            ) {
                Icon(Icons.Rounded.Add, contentDescription = "New Order")
            }
        }
    }
}

@Composable
private fun ProductsSection(
    productRepo: ProductRepository,
    canWrite: Boolean,
    currency: String,
) {
    val palette = CoopThemeTokens.colors
    val scope = rememberCoroutineScope()
    val products by productRepo.observeProducts().collectAsState(initial = emptyList())
    var search by remember { mutableStateOf("") }
    var editingProduct by remember { mutableStateOf<ProductOutDto?>(null) }
    var showCreate by remember { mutableStateOf(false) }
    var feedback by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) { productRepo.refreshFromRemote() }

    val filtered = remember(products, search) {
        val q = search.trim()
        if (q.isBlank()) products else products.filter {
            it.name.contains(q, ignoreCase = true) ||
                it.sku.contains(q, ignoreCase = true) ||
                (it.category?.contains(q, ignoreCase = true) == true)
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(CoopSpacing.md),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                CoopSearchBar(
                    query = search,
                    onQueryChange = { search = it },
                    placeholder = "Search product name, SKU, category...",
                )
            }
            if (feedback != null) {
                item {
                    CoopCard(backgroundColor = palette.surfaceContainerLow, contentPadding = 12.dp) {
                        Text(feedback!!, style = CoopType.bodyCompact, color = palette.primary)
                    }
                }
            }
            if (filtered.isEmpty()) {
                item {
                    CoopEmptyState(
                        title = "No products yet",
                        message = "Add SKUs with prices, cost, and reorder thresholds.",
                        icon = Icons.Rounded.Category,
                        actionLabel = if (canWrite) "Add Product" else null,
                        onAction = { showCreate = true },
                    )
                }
            } else {
                items(filtered, key = { it.id }) { p ->
                    val stockTone = when {
                        p.currentStock <= 0 -> PillTone.CRITICAL
                        p.currentStock <= p.reorderLevel -> PillTone.WARNING
                        else -> PillTone.SUCCESS
                    }
                    val stockLabel = when {
                        p.currentStock <= 0 -> "Out (${p.currentStock})"
                        p.currentStock <= p.reorderLevel -> "Low (${p.currentStock})"
                        else -> "${p.currentStock} in stock"
                    }
                    CoopCard(
                        modifier = Modifier.fillMaxWidth(),
                        onClick = if (canWrite) { { editingProduct = p } } else null,
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.Top,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(p.name, style = CoopType.titleMd, color = palette.onSurface)
                                Text(
                                    text = "${p.sku}${p.category?.let { " · $it" } ?: ""}",
                                    style = CoopType.bodyCompact,
                                    color = palette.outline,
                                )
                            }
                            CoopStatusPill(text = stockLabel, tone = stockTone)
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                text = "Price: ${MoneyFormatter.format(p.unitPrice, currency)}",
                                style = CoopType.bodyCompact.copy(fontWeight = FontWeight.SemiBold),
                                color = palette.onSurface,
                            )
                            p.costPrice?.let {
                                Text(
                                    text = "Cost: ${MoneyFormatter.format(it, currency)}",
                                    style = CoopType.bodyCompact,
                                    color = palette.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }
            item { Spacer(modifier = Modifier.height(72.dp)) }
        }

        if (canWrite) {
            FloatingActionButton(
                onClick = { showCreate = true },
                containerColor = palette.primary,
                contentColor = palette.onPrimary,
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(CoopSpacing.md),
            ) {
                Icon(Icons.Rounded.Add, contentDescription = "Add Product")
            }
        }
    }

    if (showCreate || editingProduct != null) {
        ProductEditorDialog(
            existing = editingProduct,
            onDismiss = {
                showCreate = false
                editingProduct = null
            },
            onSave = { sku, name, category, desc, price, cost, stock, reorder ->
                scope.launch {
                    val res = if (editingProduct == null) {
                        productRepo.createProduct(
                            ProductCreateDto(
                                sku = sku,
                                name = name,
                                category = category.ifBlank { null },
                                description = desc.ifBlank { null },
                                unitPrice = price,
                                costPrice = cost,
                                currentStock = stock,
                                reorderLevel = reorder,
                            ),
                        )
                    } else {
                        productRepo.updateProduct(
                            editingProduct!!.id,
                            ProductUpdateDto(
                                name = name,
                                category = category.ifBlank { null },
                                description = desc.ifBlank { null },
                                unitPrice = price,
                                costPrice = cost,
                                reorderLevel = reorder,
                            ),
                        )
                    }
                    res.onSuccess {
                        feedback = if (editingProduct == null) "Product created." else "Product updated."
                        showCreate = false
                        editingProduct = null
                    }.onFailure {
                        feedback = ApiErrorParser.message(it, "Could not save product")
                    }
                }
            },
            onDelete = editingProduct?.let { prod ->
                {
                    scope.launch {
                        productRepo.deleteProduct(prod.id)
                            .onSuccess {
                                feedback = "Product archived."
                                editingProduct = null
                            }
                            .onFailure { feedback = ApiErrorParser.message(it) }
                    }
                }
            },
        )
    }
}

@Composable
private fun InventorySection(
    productRepo: ProductRepository,
    canWrite: Boolean,
    currency: String,
) {
    val palette = CoopThemeTokens.colors
    val scope = rememberCoroutineScope()
    val products by productRepo.observeProducts().collectAsState(initial = emptyList())
    var summary by remember { mutableStateOf<InventorySummaryDto?>(null) }
    var lowOnly by remember { mutableStateOf(false) }
    var adjusting by remember { mutableStateOf<ProductOutDto?>(null) }
    var ledgerProduct by remember { mutableStateOf<ProductOutDto?>(null) }
    var movements by remember { mutableStateOf<List<StockMovementOutDto>>(emptyList()) }
    var message by remember { mutableStateOf<String?>(null) }

    fun refreshSummary() {
        scope.launch {
            productRepo.getInventorySummary().onSuccess { summary = it }
        }
    }

    LaunchedEffect(products) { refreshSummary() }

    val items = remember(products, lowOnly) {
        if (!lowOnly) products else products.filter { it.currentStock <= it.reorderLevel }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(CoopSpacing.md),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (summary != null) {
            val s = summary!!
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    CoopKpiCard(
                        label = "Stock Value",
                        value = MoneyFormatter.formatCompact(s.inventoryValue, currency),
                        subtitle = "${s.productsCount} SKUs",
                        icon = Icons.Rounded.Warehouse,
                        modifier = Modifier.weight(1f),
                    )
                    CoopKpiCard(
                        label = "Reorder Alerts",
                        value = "${s.lowStockCount + s.outOfStockCount}",
                        subtitle = "${s.outOfStockCount} out · ${s.lowStockCount} low",
                        icon = Icons.Rounded.WarningAmber,
                        iconTint = if (s.outOfStockCount > 0) palette.error else palette.warning,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                FilterChip(
                    selected = lowOnly,
                    onClick = { lowOnly = !lowOnly },
                    label = { Text("Low & Out of Stock Only") },
                )
                if (message != null) {
                    Text(message!!, style = CoopType.bodyCompact, color = palette.primary)
                }
            }
        }

        items(items, key = { it.id }) { p ->
            CoopCard(modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(p.name, style = CoopType.titleMd, color = palette.onSurface)
                        Text(
                            text = "SKU ${p.sku} · Reorder at ${p.reorderLevel}",
                            style = CoopType.bodyCompact,
                            color = palette.outline,
                        )
                    }
                    Text(
                        text = "${p.currentStock}",
                        style = CoopType.pageTitleMobile,
                        color = if (p.currentStock <= 0) palette.error else if (p.currentStock <= p.reorderLevel) palette.warning else palette.primary,
                    )
                }
                Spacer(modifier = Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (canWrite) {
                        CoopPrimaryButton(
                            text = "Adjust Stock",
                            leadingIcon = Icons.Rounded.Tune,
                            modifier = Modifier.weight(1f),
                            onClick = { adjusting = p },
                        )
                    }
                    CoopSecondaryButton(
                        text = "Ledger",
                        leadingIcon = Icons.Rounded.History,
                        modifier = Modifier.weight(1f),
                        onClick = {
                            ledgerProduct = p
                            scope.launch {
                                productRepo.getMovements(p.id).onSuccess { movements = it }
                            }
                        },
                    )
                }
            }
        }
    }

    if (adjusting != null) {
        StockAdjustmentDialog(
            product = adjusting!!,
            onDismiss = { adjusting = null },
            onSubmit = { delta, reason, note ->
                scope.launch {
                    productRepo.adjustStock(
                        adjusting!!.id,
                        AdjustStockRequestDto(change = delta, reason = reason, note = note.ifBlank { null }),
                    ).onSuccess {
                        message = "Stock updated (${if (delta > 0) "+$delta" else "$delta"})."
                        adjusting = null
                        refreshSummary()
                    }.onFailure {
                        message = ApiErrorParser.message(it, "Stock adjustment failed")
                    }
                }
            },
        )
    }

    if (ledgerProduct != null) {
        ModalBottomSheet(
            onDismissRequest = { ledgerProduct = null },
            containerColor = palette.surfaceContainerLowest,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(CoopSpacing.md)
                    .navigationBarsPadding(),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                CoopSectionHeader(
                    title = "Stock Ledger · ${ledgerProduct!!.name}",
                    subtitle = "Append-only movement history",
                )
                if (movements.isEmpty()) {
                    Text("No recorded movements yet.", style = CoopType.bodyCompact, color = palette.outline)
                } else {
                    movements.take(15).forEach { m ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = "${m.reason.replaceFirstChar { it.uppercase() }}${m.note?.let { " · $it" } ?: ""}",
                                    style = CoopType.bodyCompact.copy(fontWeight = FontWeight.SemiBold),
                                    color = palette.onSurface,
                                )
                                Text(
                                    text = m.createdAt?.take(16) ?: "",
                                    style = CoopType.labelCaps.copy(fontWeight = FontWeight.Normal),
                                    color = palette.outline,
                                )
                            }
                            CoopStatusPill(
                                text = if (m.change > 0) "+${m.change}" else "${m.change}",
                                tone = if (m.change > 0) PillTone.SUCCESS else PillTone.WARNING,
                            )
                        }
                    }
                }
                Spacer(modifier = Modifier.height(12.dp))
            }
        }
    }
}

@Composable
private fun ProductEditorDialog(
    existing: ProductOutDto?,
    onDismiss: () -> Unit,
    onSave: (sku: String, name: String, category: String, desc: String, price: Double, cost: Double?, stock: Int, reorder: Int) -> Unit,
    onDelete: (() -> Unit)?,
) {
    var sku by remember { mutableStateOf(existing?.sku ?: "") }
    var name by remember { mutableStateOf(existing?.name ?: "") }
    var category by remember { mutableStateOf(existing?.category ?: "") }
    var desc by remember { mutableStateOf(existing?.description ?: "") }
    var price by remember { mutableStateOf(existing?.unitPrice?.toString() ?: "") }
    var cost by remember { mutableStateOf(existing?.costPrice?.toString() ?: "") }
    var stock by remember { mutableStateOf(existing?.currentStock?.toString() ?: "0") }
    var reorder by remember { mutableStateOf(existing?.reorderLevel?.toString() ?: "5") }
    var err by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (existing == null) "New Product" else "Edit Product", style = CoopType.sectionHeading) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (err != null) Text(err!!, style = CoopType.bodyCompact, color = CoopThemeTokens.colors.error)
                if (existing == null) {
                    CoopTextField(value = sku, onValueChange = { sku = it }, label = "SKU *")
                }
                CoopTextField(value = name, onValueChange = { name = it }, label = "Product Name *")
                CoopTextField(value = category, onValueChange = { category = it }, label = "Category")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    CoopTextField(
                        value = price,
                        onValueChange = { price = it },
                        label = "Unit Price *",
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f),
                    )
                    CoopTextField(
                        value = cost,
                        onValueChange = { cost = it },
                        label = "Cost Price",
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f),
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (existing == null) {
                        CoopTextField(
                            value = stock,
                            onValueChange = { stock = it },
                            label = "Initial Stock",
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.weight(1f),
                        )
                    }
                    CoopTextField(
                        value = reorder,
                        onValueChange = { reorder = it },
                        label = "Reorder Level",
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                    )
                }
                CoopTextField(value = desc, onValueChange = { desc = it }, label = "Description")
            }
        },
        confirmButton = {
            CoopPrimaryButton(
                text = "Save",
                onClick = {
                    val p = price.toDoubleOrNull()
                    if (sku.trim().length < 3 || name.isBlank() || p == null || p <= 0.0) {
                        err = "SKU (min 3 chars), name, and positive unit price are required."
                        return@CoopPrimaryButton
                    }
                    onSave(
                        sku.trim(),
                        name.trim(),
                        category.trim(),
                        desc.trim(),
                        p,
                        cost.toDoubleOrNull(),
                        stock.toIntOrNull() ?: 0,
                        reorder.toIntOrNull() ?: 5,
                    )
                },
            )
        },
        dismissButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (onDelete != null) {
                    CoopGhostButton(
                        text = "Delete",
                        textColor = CoopThemeTokens.colors.error,
                        onClick = onDelete,
                    )
                }
                CoopGhostButton(text = "Cancel", onClick = onDismiss)
            }
        },
    )
}

@Composable
private fun StockAdjustmentDialog(
    product: ProductOutDto,
    onDismiss: () -> Unit,
    onSubmit: (delta: Int, reason: String, note: String) -> Unit,
) {
    var deltaStr by remember { mutableStateOf("") }
    var reason by remember { mutableStateOf("purchase") }
    var note by remember { mutableStateOf("") }
    var err by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Adjust Stock · ${product.name}", style = CoopType.titleMd) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    text = "Current stock: ${product.currentStock}. Use positive to add or negative to remove.",
                    style = CoopType.bodyCompact,
                )
                if (err != null) Text(err!!, style = CoopType.bodyCompact, color = CoopThemeTokens.colors.error)
                CoopTextField(
                    value = deltaStr,
                    onValueChange = { deltaStr = it },
                    label = "Quantity change (e.g. 10 or -2)",
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                )
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    listOf("purchase", "damaged", "returned", "correction").forEach { r ->
                        FilterChip(
                            selected = reason == r,
                            onClick = { reason = r },
                            label = { Text(r.replaceFirstChar { it.uppercase() }) },
                        )
                    }
                }
                CoopTextField(value = note, onValueChange = { note = it }, label = "Note (optional)")
            }
        },
        confirmButton = {
            CoopPrimaryButton(
                text = "Apply",
                onClick = {
                    val delta = deltaStr.toIntOrNull()
                    if (delta == null || delta == 0) {
                        err = "Enter a non-zero integer."
                        return@CoopPrimaryButton
                    }
                    if (product.currentStock + delta < 0) {
                        err = "Resulting stock cannot be negative."
                        return@CoopPrimaryButton
                    }
                    onSubmit(delta, reason, note)
                },
            )
        },
        dismissButton = {
            CoopGhostButton(text = "Cancel", onClick = onDismiss)
        },
    )
}
