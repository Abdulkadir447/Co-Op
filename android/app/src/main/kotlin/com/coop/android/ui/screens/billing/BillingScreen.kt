package com.coop.android.ui.screens.billing

import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.coop.android.core.auth.WriteMatrix
import com.coop.android.core.network.ApiErrorParser
import com.coop.android.core.network.dto.*
import com.coop.android.data.repository.BillingLicenseRepository
import com.coop.android.ui.components.*
import com.coop.android.ui.theme.CoopSpacing
import com.coop.android.ui.theme.CoopThemeTokens
import com.coop.android.ui.theme.CoopType
import kotlinx.coroutines.launch

private data class PlanSpec(
    val key: String,
    val name: String,
    val monthlyPrice: Int?,
    val tagline: String,
    val features: List<String>,
    val highlight: Boolean = false,
)

private val PLAN_CATALOG = listOf(
    PlanSpec(
        key = "free",
        name = "Free",
        monthlyPrice = 0,
        tagline = "Get started with core offline-first inventory & orders.",
        features = listOf(
            "50 AI credits / month",
            "Unlimited products, orders & customers",
            "Offline SQLite mirror & sync",
        ),
    ),
    PlanSpec(
        key = "starter",
        name = "Starter",
        monthlyPrice = 29,
        tagline = "Growing teams needing reports, invoicing & team roles.",
        features = listOf(
            "300 AI credits / month",
            "All 4 business reports + CSV/XLSX/PDF export",
            "Sequential tax invoices & receivables",
            "Unlimited team seats",
        ),
    ),
    PlanSpec(
        key = "professional",
        name = "Professional",
        monthlyPrice = 99,
        tagline = "Full Zeno AI advisor, forecasts & automated briefings.",
        features = listOf(
            "1,000 AI credits / month",
            "Day 1 Briefing & Zeno action drafts",
            "Multi-month least-squares forecasting",
            "Priority cloud sync & backups",
        ),
        highlight = true,
    ),
    PlanSpec(
        key = "enterprise",
        name = "Enterprise",
        monthlyPrice = null,
        tagline = "Custom AI allocation, SLA & dedicated onboarding.",
        features = listOf(
            "Unlimited AI credits",
            "Signed offline enterprise licences",
            "Dedicated account & migration support",
        ),
    ),
)

@Composable
fun BillingScreen(
    repo: BillingLicenseRepository,
    userEmail: String?,
    currentRole: String,
    onOpenSupport: () -> Unit,
    onBack: () -> Unit,
) {
    val palette = CoopThemeTokens.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val isOwner = WriteMatrix.isOwner(currentRole)

    var loading by remember { mutableStateOf(true) }
    var summary by remember { mutableStateOf<BillingSummaryDto?>(null) }
    var licenseStatus by remember { mutableStateOf<LicenseStatusResponseDto?>(null) }
    var paymentConfig by remember { mutableStateOf<PaymentConfigDto?>(null) }
    var payments by remember { mutableStateOf<List<BillingPaymentRecordDto>>(emptyList()) }
    var annual by remember { mutableStateOf(true) }
    var licenseKey by remember { mutableStateOf("") }
    var lastReference by remember { mutableStateOf("") }
    var showDowngradeConfirm by remember { mutableStateOf(false) }
    var feedback by remember { mutableStateOf<String?>(null) }

    fun load() {
        scope.launch {
            loading = true
            repo.getBillingSummary().onSuccess { summary = it }
            repo.getLicenseStatus().onSuccess { licenseStatus = it }
            repo.getPaymentConfig().onSuccess { paymentConfig = it }
            repo.listPayments().onSuccess { payments = it }
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
            title = { Text("Billing, Plans & Licences", style = CoopType.titleMd) },
            navigationIcon = {
                IconButton(onClick = onBack) { Icon(Icons.Rounded.ArrowBack, contentDescription = "Back") }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = palette.surfaceContainerLowest),
        )

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(CoopSpacing.md),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (!isOwner) {
                item {
                    CoopCard(backgroundColor = palette.surfaceContainerLow, contentPadding = 12.dp) {
                        Text(
                            "Billing and licences are managed by the business owner.",
                            style = CoopType.bodyCompact,
                            color = palette.onSurfaceVariant,
                        )
                    }
                }
            }

            if (feedback != null) {
                item {
                    CoopCard(backgroundColor = palette.surfaceContainerLow, contentPadding = 12.dp) {
                        Text(feedback!!, style = CoopType.bodyCompact, color = palette.primary)
                    }
                }
            }

            if (loading && summary == null) {
                item { CoopLoader() }
            } else if (summary != null) {
                val b = summary!!
                item {
                    CoopCard(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column {
                                Text("CURRENT PLAN", style = CoopType.labelCaps, color = palette.outline)
                                Text(b.label, style = CoopType.pageTitleMobile, color = palette.primary)
                            }
                            if (b.trial.active) {
                                CoopStatusPill(text = "Trial · ${b.trial.daysRemaining}d left", tone = PillTone.AI)
                            } else if (b.license.active) {
                                CoopStatusPill(text = "Licensed", tone = PillTone.SUCCESS)
                            } else {
                                CoopStatusPill(text = b.basePlan, tone = PillTone.INFO)
                            }
                        }
                        Spacer(modifier = Modifier.height(10.dp))
                        val creditsLine = if (b.unlimited) {
                            "Unlimited monthly AI credits · ${b.used} used this month"
                        } else {
                            "${b.remaining ?: 0} of ${b.granted ?: 0} AI credits remaining (${b.used} used)"
                        }
                        Text(creditsLine, style = CoopType.bodyCompact, color = palette.onSurfaceVariant)

                        if (isOwner && b.trial.available) {
                            Spacer(modifier = Modifier.height(12.dp))
                            CoopAiButton(
                                text = "Start ${b.trial.days}-Day Free Trial (Professional)",
                                modifier = Modifier.fillMaxWidth(),
                                onClick = {
                                    scope.launch {
                                        repo.startTrial("professional")
                                            .onSuccess {
                                                summary = it
                                                feedback = "${b.trial.days}-day Professional trial activated! No card required."
                                            }
                                            .onFailure { feedback = ApiErrorParser.message(it) }
                                    }
                                },
                            )
                        }
                    }
                }

                // Billing interval toggle (Monthly vs Annual -20%)
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        CoopSectionHeader(title = "Plans (Unlimited Seats)")
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text(
                                text = if (annual) "Annual (-20%)" else "Monthly",
                                style = CoopType.labelCaps,
                                color = if (annual) palette.primary else palette.outline,
                            )
                            Switch(checked = annual, onCheckedChange = { annual = it })
                        }
                    }
                }

                items(PLAN_CATALOG, key = { it.key }) { plan ->
                    val isCurrent = b.plan.equals(plan.key, ignoreCase = true)
                    val displayPrice = when {
                        plan.monthlyPrice == null -> "Custom"
                        plan.monthlyPrice == 0 -> "$0 / mo"
                        annual -> "$${(plan.monthlyPrice * 0.8).toInt()} / mo (billed annually)"
                        else -> "$${plan.monthlyPrice} / mo"
                    }
                    CoopCard(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    Text(plan.name, style = CoopType.titleMd, color = palette.onSurface)
                                    if (plan.highlight) {
                                        CoopStatusPill(text = "Best Value", tone = PillTone.AI)
                                    }
                                }
                                Text(displayPrice, style = CoopType.bodyCompact.copy(fontWeight = FontWeight.SemiBold), color = palette.primary)
                            }
                            if (isCurrent) {
                                CoopStatusPill(text = "Active", tone = PillTone.SUCCESS)
                            }
                        }
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(plan.tagline, style = CoopType.bodyCompact, color = palette.onSurfaceVariant)
                        Spacer(modifier = Modifier.height(8.dp))
                        plan.features.forEach { feat ->
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                modifier = Modifier.padding(vertical = 2.dp),
                            ) {
                                Icon(Icons.Rounded.CheckCircle, contentDescription = null, tint = palette.primary, modifier = Modifier.size(15.dp))
                                Text(feat, style = CoopType.bodyCompact, color = palette.onSurfaceVariant)
                            }
                        }

                        if (!isCurrent && isOwner) {
                            Spacer(modifier = Modifier.height(10.dp))
                            when (plan.key) {
                                "enterprise" -> {
                                    CoopSecondaryButton(
                                        text = "Contact Sales",
                                        leadingIcon = Icons.Rounded.SupportAgent,
                                        modifier = Modifier.fillMaxWidth(),
                                        onClick = onOpenSupport,
                                    )
                                }
                                "free" -> {
                                    CoopSecondaryButton(
                                        text = "Switch to Free",
                                        modifier = Modifier.fillMaxWidth(),
                                        onClick = { showDowngradeConfirm = true },
                                    )
                                }
                                else -> {
                                    val interval = if (annual) "annual" else "monthly"
                                    val payCurrency = paymentConfig?.currency ?: "USD"
                                    if (paymentConfig?.enabled == true) {
                                        CoopPrimaryButton(
                                            text = "Pay with Paystack ($payCurrency)",
                                            leadingIcon = Icons.Rounded.Lock,
                                            modifier = Modifier.fillMaxWidth(),
                                            onClick = {
                                                scope.launch {
                                                    repo.startCheckout(plan.key, interval, userEmail)
                                                        .onSuccess { ck ->
                                                            lastReference = ck.reference
                                                            val url = ck.authorizationUrl
                                                            if (!url.isNullOrBlank()) {
                                                                CustomTabsIntent.Builder().build().launchUrl(context, Uri.parse(url))
                                                                feedback = "Complete payment in browser, then tap Verify Reference (${ck.reference})."
                                                            } else {
                                                                feedback = "Checkout reference created: ${ck.reference}"
                                                            }
                                                        }
                                                        .onFailure { feedback = ApiErrorParser.message(it) }
                                                }
                                            },
                                        )
                                    } else {
                                        CoopPrimaryButton(
                                            text = "Switch to ${plan.name}",
                                            modifier = Modifier.fillMaxWidth(),
                                            onClick = {
                                                scope.launch {
                                                    repo.changePlan(plan.key)
                                                        .onSuccess {
                                                            summary = it
                                                            feedback = "Moved to ${plan.name} plan."
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

                if (lastReference.isNotBlank()) {
                    item {
                        CoopCard(modifier = Modifier.fillMaxWidth(), backgroundColor = palette.surfaceContainerLow) {
                            CoopSectionHeader(title = "Verify Paystack Payment")
                            Spacer(modifier = Modifier.height(8.dp))
                            CoopTextField(value = lastReference, onValueChange = { lastReference = it }, label = "Reference")
                            Spacer(modifier = Modifier.height(8.dp))
                            CoopPrimaryButton(
                                text = "Verify & Apply Plan",
                                modifier = Modifier.fillMaxWidth(),
                                onClick = {
                                    scope.launch {
                                        repo.verifyPayment(lastReference.trim())
                                            .onSuccess {
                                                lastReference = ""
                                                load()
                                                feedback = "Payment verified and applied!"
                                            }
                                            .onFailure { feedback = ApiErrorParser.message(it) }
                                    }
                                },
                            )
                        }
                    }
                }

                // License Status & Activation
                item {
                    val lic = licenseStatus?.license ?: b.license
                    CoopCard(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            CoopSectionHeader(
                                title = "Licence",
                                subtitle = "Signed COOP-XXXXX-... business licence key",
                            )
                            CoopStatusPill(
                                text = if (lic.active) "Active" else if (lic.licensed) "Ended" else "None",
                                tone = if (lic.active) PillTone.SUCCESS else if (lic.licensed) PillTone.WARNING else PillTone.INFO,
                            )
                        }
                        if (lic.licensed) {
                            Spacer(modifier = Modifier.height(10.dp))
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text("Plan: ${lic.label ?: lic.plan ?: "-"} · Seats: ${lic.seats ?: "Unlimited"}", style = CoopType.bodyCompact)
                                Text("Activated: ${lic.startedAt?.take(10) ?: "-"} · Expires: ${lic.endsAt?.take(10) ?: "Perpetual"}", style = CoopType.bodyCompact)
                                if (lic.endsAt != null) {
                                    Text("Days remaining: ${lic.daysRemaining}", style = CoopType.bodyCompact)
                                }
                                lic.fingerprint?.let { fp ->
                                    Text(
                                        text = "Reference: ${fp.take(8).uppercase()}",
                                        style = CoopType.labelCaps.copy(fontFamily = FontFamily.Monospace),
                                        color = palette.outline,
                                    )
                                }
                            }
                        }
                        if (isOwner) {
                            Spacer(modifier = Modifier.height(10.dp))
                            CoopTextField(
                                value = licenseKey,
                                onValueChange = { licenseKey = it },
                                label = if (lic.licensed) "Replace Licence Key" else "Activation Key",
                                placeholder = "COOP-XXXXX-...",
                            )
                            Spacer(modifier = Modifier.height(10.dp))
                            CoopPrimaryButton(
                                text = if (lic.licensed) "Replace Licence" else "Activate Licence",
                                enabled = licenseKey.isNotBlank(),
                                modifier = Modifier.fillMaxWidth(),
                                onClick = {
                                    scope.launch {
                                        repo.activateLicense(licenseKey)
                                            .onSuccess {
                                                summary = it
                                                licenseKey = ""
                                                load()
                                                feedback = "Licence activated!"
                                            }
                                            .onFailure { feedback = ApiErrorParser.message(it) }
                                    }
                                },
                            )
                        }
                    }
                }

                if (payments.isNotEmpty()) {
                    item { CoopSectionHeader(title = "Payment History") }
                    items(payments, key = { it.reference }) { pay ->
                        CoopCard(modifier = Modifier.fillMaxWidth()) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("${pay.plan.uppercase()} (${pay.interval})", style = CoopType.bodyCompact.copy(fontWeight = FontWeight.SemiBold))
                                CoopStatusPill(text = pay.status, tone = orderStatusTone(pay.status))
                            }
                            Text(
                                "${pay.currency} ${pay.amount} · ${pay.reference}${pay.paidAt?.let { " · ${it.take(10)}" } ?: ""}",
                                style = CoopType.labelCaps,
                                color = palette.outline,
                            )
                        }
                    }
                }
            }
        }
    }

    if (showDowngradeConfirm) {
        AlertDialog(
            onDismissRequest = { showDowngradeConfirm = false },
            title = { Text("Switch to Free plan?", style = CoopType.sectionHeading) },
            text = {
                Text(
                    "Your AI credit allowance will drop to the Free tier (50/month). Your business data remains intact.",
                    style = CoopType.bodyCompact,
                )
            },
            confirmButton = {
                CoopDangerButton(
                    text = "Switch to Free",
                    onClick = {
                        scope.launch {
                            repo.changePlan("free")
                                .onSuccess {
                                    summary = it
                                    showDowngradeConfirm = false
                                    feedback = "Switched to Free plan."
                                }
                                .onFailure {
                                    showDowngradeConfirm = false
                                    feedback = ApiErrorParser.message(it)
                                }
                        }
                    },
                )
            },
            dismissButton = { CoopGhostButton(text = "Keep Plan", onClick = { showDowngradeConfirm = false }) },
        )
    }
}
