package com.coop.android.ui.screens.clients

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.coop.android.core.auth.WriteMatrix
import com.coop.android.core.network.ApiErrorParser
import com.coop.android.core.network.dto.*
import com.coop.android.core.util.MoneyFormatter
import com.coop.android.data.repository.CustomerRepository
import com.coop.android.data.repository.OrderRepository
import com.coop.android.ui.components.*
import com.coop.android.ui.theme.CoopSpacing
import com.coop.android.ui.theme.CoopThemeTokens
import com.coop.android.ui.theme.CoopType
import kotlinx.coroutines.launch

@Composable
fun CustomersScreen(
    customerRepo: CustomerRepository,
    role: String,
    onOpenCustomer: (Int) -> Unit,
) {
    val palette = CoopThemeTokens.colors
    val scope = rememberCoroutineScope()
    val customers by customerRepo.observeCustomers().collectAsState(initial = emptyList())
    val canWrite = WriteMatrix.canWrite(role, "/customers")

    var search by remember { mutableStateOf("") }
    var showCreate by remember { mutableStateOf(false) }
    var feedback by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) { customerRepo.refreshFromRemote() }

    val filtered = remember(customers, search) {
        val q = search.trim()
        if (q.isBlank()) customers else customers.filter {
            it.fullName.contains(q, ignoreCase = true) ||
                it.email.contains(q, ignoreCase = true) ||
                (it.company?.contains(q, ignoreCase = true) == true)
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.surface),
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(CoopSpacing.md),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                Text("Customers", style = CoopType.pageTitleMobile, color = palette.onSurface)
            }
            item {
                CoopSearchBar(
                    query = search,
                    onQueryChange = { search = it },
                    placeholder = "Search name, company, email...",
                )
            }
            if (feedback != null) {
                item { Text(feedback!!, style = CoopType.bodyCompact, color = palette.primary) }
            }
            if (filtered.isEmpty()) {
                item {
                    CoopEmptyState(
                        title = "No customers yet",
                        message = "Add customer profiles to track orders, invoices, and receivables.",
                        icon = Icons.Rounded.Group,
                        actionLabel = if (canWrite) "Add Customer" else null,
                        onAction = { showCreate = true },
                    )
                }
            } else {
                items(filtered, key = { it.id }) { c ->
                    CoopCard(
                        modifier = Modifier.fillMaxWidth(),
                        onClick = { onOpenCustomer(c.id) },
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(42.dp)
                                    .clip(CircleShape)
                                    .background(palette.primaryFixed),
                                contentAlignment = Alignment.Center,
                            ) {
                                Text(
                                    text = c.fullName.take(1).uppercase(),
                                    style = CoopType.titleMd,
                                    color = palette.onPrimaryFixedVariant,
                                )
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text(c.fullName, style = CoopType.titleMd, color = palette.onSurface)
                                Text(
                                    text = c.company?.takeIf { it.isNotBlank() }?.let { "$it · ${c.email}" } ?: c.email,
                                    style = CoopType.bodyCompact,
                                    color = palette.onSurfaceVariant,
                                )
                                c.phone?.takeIf { it.isNotBlank() }?.let {
                                    Text(it, style = CoopType.labelCaps.copy(fontWeight = FontWeight.Normal), color = palette.outline)
                                }
                            }
                            Icon(Icons.Rounded.ChevronRight, contentDescription = null, tint = palette.outline)
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
                Icon(Icons.Rounded.PersonAdd, contentDescription = "Add Customer")
            }
        }
    }

    if (showCreate) {
        CustomerEditorDialog(
            existing = null,
            onDismiss = { showCreate = false },
            onSave = { name, email, phone, company, address ->
                scope.launch {
                    customerRepo.createCustomer(
                        CustomerCreateDto(
                            fullName = name,
                            email = email,
                            phone = phone.ifBlank { null },
                            company = company.ifBlank { null },
                            address = address.ifBlank { null },
                        ),
                    ).onSuccess {
                        feedback = "Customer added."
                        showCreate = false
                    }.onFailure { feedback = ApiErrorParser.message(it) }
                }
            },
        )
    }
}

@Composable
fun CustomerDetailScreen(
    customerId: Int,
    customerRepo: CustomerRepository,
    orderRepo: OrderRepository,
    role: String,
    currency: String,
    onCreateOrderForCustomer: (Int) -> Unit,
    onOpenOrder: (Int) -> Unit,
    onBack: () -> Unit,
) {
    val palette = CoopThemeTokens.colors
    val scope = rememberCoroutineScope()
    val canWrite = WriteMatrix.canWrite(role, "/customers")

    var customer by remember { mutableStateOf<CustomerOutDto?>(null) }
    val allOrders by orderRepo.observeOrders().collectAsState(initial = emptyList())
    var editing by remember { mutableStateOf(false) }
    var feedback by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(customerId) {
        customerRepo.getCustomer(customerId).onSuccess { customer = it }
    }

    val customerOrders = remember(allOrders, customerId) {
        allOrders.filter { it.customerId == customerId }
    }
    val totalSpend = customerOrders.filter { it.status != "cancelled" }.sumOf { it.grandTotal.takeIf { g -> g > 0 } ?: it.totalAmount }
    val unpaid = customerOrders.filter { it.status != "cancelled" }.sumOf { it.balanceDue }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.surface),
    ) {
        TopAppBar(
            title = { Text(customer?.fullName ?: "Customer", style = CoopType.titleMd) },
            navigationIcon = {
                IconButton(onClick = onBack) { Icon(Icons.Rounded.ArrowBack, contentDescription = "Back") }
            },
            actions = {
                if (canWrite && customer != null) {
                    IconButton(onClick = { editing = true }) {
                        Icon(Icons.Rounded.Edit, contentDescription = "Edit")
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
            if (feedback != null) {
                item { Text(feedback!!, style = CoopType.bodyCompact, color = palette.primary) }
            }
            if (customer != null) {
                val c = customer!!
                item {
                    CoopCard(modifier = Modifier.fillMaxWidth()) {
                        Text(c.fullName, style = CoopType.sectionHeading, color = palette.onSurface)
                        c.company?.takeIf { it.isNotBlank() }?.let {
                            Text(it, style = CoopType.bodyCompact, color = palette.primary)
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Email: ${c.email}", style = CoopType.bodyCompact, color = palette.onSurfaceVariant)
                        c.phone?.takeIf { it.isNotBlank() }?.let {
                            Text("Phone: $it", style = CoopType.bodyCompact, color = palette.onSurfaceVariant)
                        }
                        c.address?.takeIf { it.isNotBlank() }?.let {
                            Text("Address: $it", style = CoopType.bodyCompact, color = palette.onSurfaceVariant)
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                        CoopPrimaryButton(
                            text = "New Order for ${c.fullName.substringBefore(' ')}",
                            leadingIcon = Icons.Rounded.AddShoppingCart,
                            modifier = Modifier.fillMaxWidth(),
                            onClick = { onCreateOrderForCustomer(c.id) },
                        )
                    }
                }

                item {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        CoopKpiCard(
                            label = "Total Spend",
                            value = MoneyFormatter.formatCompact(totalSpend, currency),
                            subtitle = "${customerOrders.size} orders",
                            icon = Icons.Rounded.Payments,
                            modifier = Modifier.weight(1f),
                        )
                        CoopKpiCard(
                            label = "Balance Owed",
                            value = MoneyFormatter.formatCompact(unpaid, currency),
                            icon = Icons.Rounded.AccountBalanceWallet,
                            iconTint = if (unpaid > 0) palette.warning else palette.success,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }

                item { CoopSectionHeader(title = "Order History") }

                if (customerOrders.isEmpty()) {
                    item {
                        CoopEmptyState(
                            title = "No orders yet",
                            message = "Create an order for this customer to see history here.",
                        )
                    }
                } else {
                    items(customerOrders, key = { it.id }) { o ->
                        CoopCard(
                            modifier = Modifier.fillMaxWidth(),
                            onClick = { onOpenOrder(o.id) },
                        ) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("Order #${o.id}", style = CoopType.titleMd)
                                CoopStatusPill(text = o.status, tone = orderStatusTone(o.status))
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(o.orderDate?.take(10) ?: "", style = CoopType.bodyCompact, color = palette.outline)
                                Text(
                                    MoneyFormatter.format(o.grandTotal.takeIf { it > 0 } ?: o.totalAmount, currency),
                                    style = CoopType.titleMd,
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    if (editing && customer != null) {
        CustomerEditorDialog(
            existing = customer,
            onDismiss = { editing = false },
            onSave = { name, email, phone, company, address ->
                scope.launch {
                    customerRepo.updateCustomer(
                        customer!!.id,
                        CustomerUpdateDto(
                            fullName = name,
                            email = email,
                            phone = phone.ifBlank { null },
                            company = company.ifBlank { null },
                            address = address.ifBlank { null },
                        ),
                    ).onSuccess {
                        customer = it
                        editing = false
                        feedback = "Customer updated."
                    }.onFailure { feedback = ApiErrorParser.message(it) }
                }
            },
            onDelete = {
                scope.launch {
                    customerRepo.deleteCustomer(customer!!.id)
                        .onSuccess {
                            editing = false
                            onBack()
                        }
                        .onFailure { feedback = ApiErrorParser.message(it) }
                }
            },
        )
    }
}

@Composable
private fun CustomerEditorDialog(
    existing: CustomerOutDto?,
    onDismiss: () -> Unit,
    onSave: (name: String, email: String, phone: String, company: String, address: String) -> Unit,
    onDelete: (() -> Unit)? = null,
) {
    var name by remember { mutableStateOf(existing?.fullName ?: "") }
    var email by remember { mutableStateOf(existing?.email ?: "") }
    var phone by remember { mutableStateOf(existing?.phone ?: "") }
    var company by remember { mutableStateOf(existing?.company ?: "") }
    var address by remember { mutableStateOf(existing?.address ?: "") }
    var err by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (existing == null) "New Customer" else "Edit Customer", style = CoopType.sectionHeading) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (err != null) Text(err!!, style = CoopType.bodyCompact, color = CoopThemeTokens.colors.error)
                CoopTextField(value = name, onValueChange = { name = it }, label = "Full Name *")
                CoopTextField(value = email, onValueChange = { email = it }, label = "Email *")
                CoopTextField(value = phone, onValueChange = { phone = it }, label = "Phone")
                CoopTextField(value = company, onValueChange = { company = it }, label = "Company")
                CoopTextField(value = address, onValueChange = { address = it }, label = "Address")
            }
        },
        confirmButton = {
            CoopPrimaryButton(
                text = "Save",
                onClick = {
                    if (name.isBlank() || !email.contains("@")) {
                        err = "Full name and a valid email are required."
                        return@CoopPrimaryButton
                    }
                    onSave(name.trim(), email.trim(), phone.trim(), company.trim(), address.trim())
                },
            )
        },
        dismissButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (onDelete != null) {
                    CoopGhostButton(text = "Delete", textColor = CoopThemeTokens.colors.error, onClick = onDelete)
                }
                CoopGhostButton(text = "Cancel", onClick = onDismiss)
            }
        },
    )
}
