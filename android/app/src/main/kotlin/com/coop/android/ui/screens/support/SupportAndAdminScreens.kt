package com.coop.android.ui.screens.support

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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.coop.android.BuildConfig
import com.coop.android.core.network.ApiErrorParser
import com.coop.android.core.network.dto.*
import com.coop.android.data.repository.FeedbackSupportPlatformRepository
import com.coop.android.ui.components.*
import com.coop.android.ui.theme.CoopSpacing
import com.coop.android.ui.theme.CoopThemeTokens
import com.coop.android.ui.theme.CoopType
import kotlinx.coroutines.launch

@Composable
fun SupportScreen(
    repo: FeedbackSupportPlatformRepository,
    onBack: () -> Unit,
) {
    val palette = CoopThemeTokens.colors
    val scope = rememberCoroutineScope()

    var rating by remember { mutableStateOf(5) }
    var overallFeedback by remember { mutableStateOf("") }
    var likesFeedback by remember { mutableStateOf("") }
    var issuesFeedback by remember { mutableStateOf("") }
    var improvementsFeedback by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("bug") }
    var severity by remember { mutableStateOf("normal") }
    var subject by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var issues by remember { mutableStateOf<List<IssueReportOutDto>>(emptyList()) }
    var statusMsg by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        repo.listIssues().onSuccess { issues = it }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.surface),
    ) {
        TopAppBar(
            title = { Text("Feedback & Support", style = CoopType.titleMd) },
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
            if (statusMsg != null) {
                item {
                    CoopCard(backgroundColor = palette.surfaceContainerLow, contentPadding = 12.dp) {
                        Text(statusMsg!!, style = CoopType.bodyCompact, color = palette.primary)
                    }
                }
            }

            item {
                CoopCard(modifier = Modifier.fillMaxWidth()) {
                    CoopSectionHeader(title = "Product Feedback")
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        (1..5).forEach { star ->
                            IconButton(onClick = { rating = star }) {
                                Icon(
                                    imageVector = if (star <= rating) Icons.Rounded.Star else Icons.Rounded.StarBorder,
                                    contentDescription = "$star stars",
                                    tint = palette.warning,
                                )
                            }
                        }
                    }
                    CoopTextField(
                        value = overallFeedback,
                        onValueChange = { overallFeedback = it },
                        label = "How is Co-op working for your business?",
                        singleLine = false,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    CoopTextField(
                        value = likesFeedback,
                        onValueChange = { likesFeedback = it },
                        label = "What do you like most?",
                        singleLine = false,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    CoopTextField(
                        value = issuesFeedback,
                        onValueChange = { issuesFeedback = it },
                        label = "Any issues or problems?",
                        singleLine = false,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    CoopTextField(
                        value = improvementsFeedback,
                        onValueChange = { improvementsFeedback = it },
                        label = "What would you love us to add?",
                        singleLine = false,
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    CoopSecondaryButton(
                        text = "Submit Feedback",
                        modifier = Modifier.fillMaxWidth(),
                        onClick = {
                            scope.launch {
                                repo.submitFeedback(
                                    FeedbackSubmitDto(
                                        rating = rating,
                                        overall = overallFeedback.trim().takeIf { it.isNotBlank() },
                                        likes = likesFeedback.trim().takeIf { it.isNotBlank() },
                                        issues = issuesFeedback.trim().takeIf { it.isNotBlank() },
                                        improvements = improvementsFeedback.trim().takeIf { it.isNotBlank() },
                                    ),
                                )
                                    .onSuccess {
                                        overallFeedback = ""
                                        likesFeedback = ""
                                        issuesFeedback = ""
                                        improvementsFeedback = ""
                                        statusMsg = "Thank you for your feedback!"
                                    }
                                    .onFailure { statusMsg = ApiErrorParser.message(it) }
                            }
                        },
                    )
                }
            }

            item {
                CoopCard(modifier = Modifier.fillMaxWidth()) {
                    CoopSectionHeader(title = "Report an Issue")
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        listOf("bug", "data", "billing", "import", "performance", "feature", "other").forEach { c ->
                            FilterChip(selected = category == c, onClick = { category = c }, label = { Text(c) })
                        }
                    }
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        listOf("low", "normal", "high", "critical").forEach { s ->
                            FilterChip(selected = severity == s, onClick = { severity = s }, label = { Text(s) })
                        }
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    CoopTextField(value = subject, onValueChange = { subject = it }, label = "Subject *")
                    Spacer(modifier = Modifier.height(8.dp))
                    CoopTextField(
                        value = description,
                        onValueChange = { description = it },
                        label = "Description *",
                        singleLine = false,
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    CoopPrimaryButton(
                        text = "Submit Issue Report",
                        enabled = subject.length >= 3 && description.length >= 10,
                        modifier = Modifier.fillMaxWidth(),
                        onClick = {
                            scope.launch {
                                repo.submitIssue(
                                    IssueReportInDto(
                                        category = category,
                                        severity = severity,
                                        subject = subject.trim(),
                                        description = description.trim(),
                                        appVersion = BuildConfig.VERSION_NAME,
                                    ),
                                ).onSuccess { created ->
                                    issues = listOf(created) + issues
                                    subject = ""
                                    description = ""
                                    statusMsg = "Issue #${created.id} submitted."
                                }.onFailure { statusMsg = ApiErrorParser.message(it) }
                            }
                        },
                    )
                }
            }

            if (issues.isNotEmpty()) {
                item { CoopSectionHeader(title = "Submitted Reports") }
                items(issues, key = { it.id }) { issue ->
                    CoopCard(modifier = Modifier.fillMaxWidth()) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(issue.subject, style = CoopType.titleMd, modifier = Modifier.weight(1f))
                            CoopStatusPill(text = issue.status, tone = PillTone.INFO)
                        }
                        Text("${issue.category} · ${issue.severity}", style = CoopType.labelCaps, color = palette.outline)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(issue.description, style = CoopType.bodyCompact, color = palette.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

private enum class AdminTab(val label: String) {
    METRICS("Fundraising"),
    FEEDBACK("Feedback"),
    BUSINESSES("Businesses"),
    LICENCES("Licences"),
    TOOLS("Admin Tools"),
}

@Composable
fun PlatformAdminScreen(
    repo: FeedbackSupportPlatformRepository,
    onBack: () -> Unit,
) {
    val palette = CoopThemeTokens.colors
    val scope = rememberCoroutineScope()
    val clipboard = LocalClipboardManager.current
    var loading by remember { mutableStateOf(true) }
    var tab by remember { mutableStateOf(AdminTab.METRICS) }
    var me by remember { mutableStateOf<PlatformMeDto?>(null) }
    var overview by remember { mutableStateOf<PlatformOverviewDto?>(null) }
    var metrics by remember { mutableStateOf<PlatformInvestorMetricsDto?>(null) }
    var feedbackList by remember { mutableStateOf<List<PlatformFeedbackItemDto>>(emptyList()) }
    var businesses by remember { mutableStateOf<List<PlatformBusinessItemDto>>(emptyList()) }
    var licenses by remember { mutableStateOf<List<PlatformLicenseItemDto>>(emptyList()) }
    var copiedNotice by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    // Admin Tools state (in-memory only, never persisted)
    var adminToken by remember { mutableStateOf("") }
    var mintBusinessId by remember { mutableStateOf("1") }
    var mintPlan by remember { mutableStateOf("professional") }
    var mintDays by remember { mutableStateOf("365") }
    var mintSeats by remember { mutableStateOf("5") }
    var mintedKeyResult by remember { mutableStateOf<AdminIssuedLicenseDto?>(null) }
    var revokeTarget by remember { mutableStateOf("") }
    var revokeReason by remember { mutableStateOf("") }
    var paystackSecret by remember { mutableStateOf("") }
    var webhookRef by remember { mutableStateOf("") }
    var toolStatus by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        repo.getPlatformMe()
            .onSuccess { p ->
                me = p
                if (p.isAdmin) {
                    repo.getPlatformOverview().onSuccess { overview = it }
                    repo.getPlatformInvestorMetrics().onSuccess { metrics = it }
                    repo.getPlatformFeedback().onSuccess { feedbackList = it }
                    repo.getPlatformBusinesses().onSuccess { businesses = it }
                    repo.getPlatformLicenses().onSuccess { licenses = it }
                }
            }
            .onFailure { error = ApiErrorParser.message(it) }
        loading = false
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.surface),
    ) {
        TopAppBar(
            title = { Text("Platform Admin", style = CoopType.titleMd) },
            navigationIcon = {
                IconButton(onClick = onBack) { Icon(Icons.Rounded.ArrowBack, contentDescription = "Back") }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = palette.surfaceContainerLowest),
        )

        if (me?.isAdmin == true) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(palette.surfaceContainerLowest)
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = CoopSpacing.md, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                AdminTab.entries.forEach { t ->
                    val label = when (t) {
                        AdminTab.FEEDBACK -> "${t.label} (${feedbackList.size})"
                        AdminTab.BUSINESSES -> "${t.label} (${businesses.size})"
                        AdminTab.LICENCES -> "${t.label} (${licenses.size})"
                        AdminTab.METRICS -> t.label
                        AdminTab.TOOLS -> t.label
                    }
                    FilterChip(selected = tab == t, onClick = { tab = t }, label = { Text(label) })
                }
            }
            HorizontalDivider(color = palette.borderSubtle)
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(CoopSpacing.md),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (loading) {
                item { CoopLoader() }
            } else if (error != null) {
                item { CoopErrorState(message = error!!) }
            } else if (me?.isAdmin != true) {
                item {
                    CoopEmptyState(
                        title = "Platform Admin Restricted",
                        message = "Your current account (${me?.email ?: "offline"}) is not on the platform admin allow-list.",
                        icon = Icons.Rounded.AdminPanelSettings,
                    )
                }
            } else {
                overview?.let { ov ->
                    item {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            CoopKpiCard("Businesses", ov.businesses.toString(), Icons.Rounded.Store, modifier = Modifier.weight(1f))
                            CoopKpiCard("Team Members", ov.members.toString(), Icons.Rounded.Group, modifier = Modifier.weight(1f))
                        }
                    }
                    item {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            CoopKpiCard(
                                label = "Active Licences",
                                value = "${ov.licensesActive}/${ov.licensesTotal}",
                                icon = Icons.Rounded.Key,
                                modifier = Modifier.weight(1f),
                            )
                            CoopKpiCard(
                                label = "Payments",
                                value = "${ov.paymentsSuccess} paid",
                                subtitle = "${ov.paymentsPending} pending",
                                icon = Icons.Rounded.Payments,
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                }

                when (tab) {
                    AdminTab.METRICS -> {
                        metrics?.let { m ->
                            item {
                                CoopAiCard(title = "Investor Headline (${m.windowDays}d)", badgeText = "Ledger Verified") {
                                    Text(m.headline, style = CoopType.bodyCompact, color = palette.onSurface)
                                    Spacer(modifier = Modifier.height(10.dp))
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        copiedNotice?.let {
                                            Text(it, style = CoopType.labelCaps, color = palette.primary)
                                        } ?: Spacer(Modifier.width(1.dp))
                                        CoopSecondaryButton(
                                            text = "Copy Headline",
                                            leadingIcon = Icons.Rounded.ContentCopy,
                                            onClick = {
                                                clipboard.setText(AnnotatedString(m.headline))
                                                copiedNotice = "Copied to clipboard"
                                            },
                                        )
                                    }
                                }
                            }
                            item {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    CoopKpiCard(
                                        label = "Activation",
                                        value = m.activation.ratePct?.let { "$it%" } ?: "—",
                                        subtitle = "${m.activation.activated}/${m.activation.eligibleBusinesses} businesses",
                                        icon = Icons.Rounded.Bolt,
                                        modifier = Modifier.weight(1f),
                                    )
                                    CoopKpiCard(
                                        label = "Weekly Retention",
                                        value = m.engagement.retentionPct?.let { "$it%" } ?: "—",
                                        subtitle = "${m.engagement.activeLast7Days} active 7d",
                                        icon = Icons.Rounded.Repeat,
                                        modifier = Modifier.weight(1f),
                                    )
                                }
                            }
                            item {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    CoopKpiCard(
                                        label = "MRR",
                                        value = String.format(java.util.Locale.US, "%.2f", m.revenue.mrr),
                                        subtitle = "${m.revenue.payingBusinesses} paying",
                                        icon = Icons.Rounded.AttachMoney,
                                        modifier = Modifier.weight(1f),
                                    )
                                    CoopKpiCard(
                                        label = "AI Usage",
                                        value = "${m.ai.creditsUsed} cr",
                                        subtitle = "${m.ai.requests} turns",
                                        icon = Icons.Rounded.AutoAwesome,
                                        modifier = Modifier.weight(1f),
                                    )
                                }
                            }
                        }
                    }

                    AdminTab.FEEDBACK -> {
                        if (feedbackList.isEmpty()) {
                            item { CoopEmptyState(title = "No feedback yet", message = "Tenant feedback responses will appear here.") }
                        } else {
                            items(feedbackList, key = { it.id }) { fb ->
                                CoopCard(modifier = Modifier.fillMaxWidth()) {
                                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text(fb.businessName ?: "Business", style = CoopType.titleMd)
                                        fb.rating?.let { CoopStatusPill(text = "$it / 5", tone = PillTone.WARNING) }
                                    }
                                    (fb.overall ?: fb.issues)?.let {
                                        Spacer(modifier = Modifier.height(4.dp))
                                        Text(it, style = CoopType.bodyCompact, color = palette.onSurfaceVariant)
                                    }
                                    fb.createdAt?.let {
                                        Text(it.take(10), style = CoopType.labelCaps.copy(fontWeight = FontWeight.Normal), color = palette.outline)
                                    }
                                }
                            }
                        }
                    }

                    AdminTab.BUSINESSES -> {
                        if (businesses.isEmpty()) {
                            item { CoopEmptyState(title = "No businesses", message = "Registered tenants will appear here.") }
                        } else {
                            items(businesses, key = { it.id }) { b ->
                                CoopCard(modifier = Modifier.fillMaxWidth()) {
                                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(b.name, style = CoopType.titleMd)
                                            Text(b.ownerEmail ?: "—", style = CoopType.bodyCompact, color = palette.onSurfaceVariant)
                                        }
                                        CoopStatusPill(text = b.plan, tone = if (b.plan == "free") PillTone.INFO else PillTone.SUCCESS)
                                    }
                                    Text(
                                        "${b.currency ?: "USD"} · Joined ${b.createdAt?.take(10) ?: "—"}",
                                        style = CoopType.labelCaps.copy(fontWeight = FontWeight.Normal),
                                        color = palette.outline,
                                    )
                                }
                            }
                        }
                    }

                    AdminTab.LICENCES -> {
                        if (licenses.isEmpty()) {
                            item { CoopEmptyState(title = "No licences", message = "Minted business licences will appear here.") }
                        } else {
                            items(licenses, key = { it.id }) { lic ->
                                val status = when {
                                    lic.revokedAt != null -> "revoked" to PillTone.CRITICAL
                                    lic.expiresAt != null && lic.expiresAt < java.time.Instant.now().toString() -> "expired" to PillTone.WARNING
                                    else -> "active" to PillTone.SUCCESS
                                }
                                CoopCard(modifier = Modifier.fillMaxWidth()) {
                                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text(lic.businessName ?: "Business", style = CoopType.titleMd)
                                        CoopStatusPill(text = status.first, tone = status.second)
                                    }
                                    Text(
                                        "${lic.plan} · ${lic.seats} seats · ${lic.fingerprint.take(12).uppercase()}",
                                        style = CoopType.bodyCompact.copy(fontFamily = FontFamily.Monospace),
                                        color = palette.onSurfaceVariant,
                                    )
                                    Text(
                                        "Expires: ${lic.expiresAt?.take(10) ?: "Perpetual"}",
                                        style = CoopType.labelCaps.copy(fontWeight = FontWeight.Normal),
                                        color = palette.outline,
                                    )
                                }
                            }
                        }
                    }

                    AdminTab.TOOLS -> {
                        if (toolStatus != null) {
                            item {
                                CoopCard(backgroundColor = palette.surfaceContainerLow, contentPadding = 12.dp) {
                                    Text(toolStatus!!, style = CoopType.bodyCompact, color = palette.primary)
                                }
                            }
                        }

                        item {
                            CoopCard(modifier = Modifier.fillMaxWidth()) {
                                CoopSectionHeader(
                                    title = "Mint & Revoke Licences (/admin/*)",
                                    subtitle = "Uses X-Admin-Token in memory only (never stored)",
                                )
                                Spacer(modifier = Modifier.height(10.dp))
                                CoopTextField(
                                    value = adminToken,
                                    onValueChange = { adminToken = it },
                                    label = "X-Admin-Token",
                                    visualTransformation = PasswordVisualTransformation(),
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    CoopTextField(
                                        value = mintBusinessId,
                                        onValueChange = { mintBusinessId = it },
                                        label = "Business ID",
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                        modifier = Modifier.weight(1f),
                                    )
                                    CoopTextField(
                                        value = mintDays,
                                        onValueChange = { mintDays = it },
                                        label = "Days",
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                        modifier = Modifier.weight(1f),
                                    )
                                    CoopTextField(
                                        value = mintSeats,
                                        onValueChange = { mintSeats = it },
                                        label = "Seats",
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                        modifier = Modifier.weight(1f),
                                    )
                                }
                                Spacer(modifier = Modifier.height(8.dp))
                                Row(
                                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    listOf("starter", "professional", "enterprise").forEach { pl ->
                                        FilterChip(selected = mintPlan == pl, onClick = { mintPlan = pl }, label = { Text(pl) })
                                    }
                                }
                                Spacer(modifier = Modifier.height(10.dp))
                                CoopPrimaryButton(
                                    text = "Mint Licence Key",
                                    enabled = adminToken.isNotBlank() && (mintBusinessId.toIntOrNull() ?: 0) > 0,
                                    modifier = Modifier.fillMaxWidth(),
                                    onClick = {
                                        val bid = mintBusinessId.toIntOrNull() ?: return@CoopPrimaryButton
                                        scope.launch {
                                            repo.adminGenerateLicense(
                                                adminToken = adminToken,
                                                businessId = bid,
                                                plan = mintPlan,
                                                days = mintDays.toIntOrNull(),
                                                seats = mintSeats.toIntOrNull() ?: 1,
                                            ).onSuccess { issued ->
                                                mintedKeyResult = issued
                                                toolStatus = "Licence minted for Business #$bid."
                                                repo.getPlatformLicenses().onSuccess { licenses = it }
                                            }.onFailure {
                                                toolStatus = ApiErrorParser.message(it)
                                            }
                                        }
                                    },
                                )

                                mintedKeyResult?.let { res ->
                                    Spacer(modifier = Modifier.height(10.dp))
                                    CoopCard(backgroundColor = palette.surfaceContainerLow, contentPadding = 12.dp) {
                                        Text("ACTIVATION KEY", style = CoopType.labelCaps, color = palette.primary)
                                        Text(res.key, style = CoopType.bodyCompact.copy(fontFamily = FontFamily.Monospace))
                                        Spacer(modifier = Modifier.height(6.dp))
                                        CoopSecondaryButton(
                                            text = "Copy Key",
                                            leadingIcon = Icons.Rounded.ContentCopy,
                                            onClick = {
                                                clipboard.setText(AnnotatedString(res.key))
                                                toolStatus = "Activation key copied to clipboard."
                                            },
                                        )
                                    }
                                }

                                HorizontalDivider(color = palette.borderSubtle, modifier = Modifier.padding(vertical = 12.dp))
                                CoopTextField(
                                    value = revokeTarget,
                                    onValueChange = { revokeTarget = it },
                                    label = "Fingerprint or COOP-... Key to Revoke",
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                                CoopTextField(
                                    value = revokeReason,
                                    onValueChange = { revokeReason = it },
                                    label = "Reason (optional)",
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                                CoopDangerButton(
                                    text = "Revoke Licence",
                                    enabled = adminToken.isNotBlank() && revokeTarget.isNotBlank(),
                                    modifier = Modifier.fillMaxWidth(),
                                    onClick = {
                                        scope.launch {
                                            repo.adminRevokeLicense(adminToken, revokeTarget, revokeReason)
                                                .onSuccess {
                                                    revokeTarget = ""
                                                    revokeReason = ""
                                                    toolStatus = "Licence revoked (${it.fingerprint.take(12)})."
                                                    repo.getPlatformLicenses().onSuccess { licenses = it }
                                                }
                                                .onFailure { toolStatus = ApiErrorParser.message(it) }
                                        }
                                    },
                                )
                            }
                        }

                        item {
                            CoopCard(modifier = Modifier.fillMaxWidth()) {
                                CoopSectionHeader(
                                    title = "Paystack Webhook Tester (/webhooks/paystack)",
                                    subtitle = "Signs charge.success with HMAC-SHA512 (use sk_test_ only)",
                                )
                                Spacer(modifier = Modifier.height(10.dp))
                                CoopTextField(
                                    value = paystackSecret,
                                    onValueChange = { paystackSecret = it },
                                    label = "Paystack Test Secret (sk_test_...)",
                                    visualTransformation = PasswordVisualTransformation(),
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                                CoopTextField(
                                    value = webhookRef,
                                    onValueChange = { webhookRef = it },
                                    label = "Transaction Reference",
                                    placeholder = "coop_...",
                                )
                                Spacer(modifier = Modifier.height(10.dp))
                                CoopSecondaryButton(
                                    text = "Send Signed Test Webhook",
                                    enabled = paystackSecret.startsWith("sk_test_") && webhookRef.isNotBlank(),
                                    modifier = Modifier.fillMaxWidth(),
                                    onClick = {
                                        scope.launch {
                                            repo.triggerPaystackWebhook(paystackSecret, webhookRef)
                                                .onSuccess { res -> toolStatus = "Webhook response: $res" }
                                                .onFailure { toolStatus = ApiErrorParser.message(it) }
                                        }
                                    },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
