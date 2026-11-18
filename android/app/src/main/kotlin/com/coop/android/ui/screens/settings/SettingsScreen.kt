package com.coop.android.ui.screens.settings

import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import coil.compose.AsyncImage
import com.coop.android.BuildConfig
import com.coop.android.core.auth.SessionManager
import com.coop.android.core.auth.SessionState
import com.coop.android.core.auth.WriteMatrix
import com.coop.android.core.network.ApiErrorParser
import com.coop.android.core.network.dto.*
import com.coop.android.data.repository.FeedbackSupportPlatformRepository
import com.coop.android.data.repository.SettingsBackupRepository
import com.coop.android.ui.components.*
import com.coop.android.ui.theme.CoopRadius
import com.coop.android.ui.theme.CoopSpacing
import com.coop.android.ui.theme.CoopThemeTokens
import com.coop.android.ui.theme.CoopType
import com.coop.android.ui.theme.ThemeMode
import kotlinx.coroutines.launch
import java.io.File

enum class SettingsTab(val label: String) {
    COMPANY("Company"),
    APPEARANCE("Theme & AI"),
    NOTIFICATIONS("Alerts"),
    SECURITY("Security"),
    BACKUP("Backup"),
    AUDIT("Audit Log"),
}

@Composable
fun SettingsScreen(
    repo: SettingsBackupRepository,
    feedbackRepo: FeedbackSupportPlatformRepository,
    sessionManager: SessionManager,
    sessionState: SessionState,
    onBack: () -> Unit,
) {
    val palette = CoopThemeTokens.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val currentRole = sessionState.role
    val currentThemeMode = sessionState.themeMode
    val isOwner = WriteMatrix.isOwner(currentRole)
    val isOwnerOrManager = currentRole == "owner" || currentRole == "manager"

    var tab by remember { mutableStateOf(SettingsTab.COMPANY) }
    var loading by remember { mutableStateOf(true) }
    var feedback by remember { mutableStateOf<String?>(null) }

    // Company form state
    var name by remember { mutableStateOf("") }
    var industry by remember { mutableStateOf("") }
    var currency by remember { mutableStateOf("USD") }
    var email by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }
    var taxId by remember { mutableStateOf("") }
    var regNumber by remember { mutableStateOf("") }
    var website by remember { mutableStateOf("") }
    var timezone by remember { mutableStateOf("") }
    var logoUrl by remember { mutableStateOf<String?>(null) }
    var taxEnabled by remember { mutableStateOf(false) }
    var taxRate by remember { mutableStateOf("0.0") }
    var taxLabel by remember { mutableStateOf("Tax") }
    var aiStyle by remember { mutableStateOf("standard") }
    var serverUrl by remember { mutableStateOf(sessionManager.getServerUrl()) }

    // Alerts state
    var summaryRecipient by remember { mutableStateOf(sessionState.email ?: "") }
    var sendingEmail by remember { mutableStateOf(false) }

    var auditEntries by remember { mutableStateOf<List<AuditEntryOutDto>>(emptyList()) }

    val logoPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            runCatching {
                val fname = context.contentResolver.query(uri, null, null, null, null)?.use { c ->
                    val idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (c.moveToFirst() && idx >= 0) c.getString(idx) else "logo.png"
                } ?: "logo.png"
                val mime = context.contentResolver.getType(uri) ?: "image/png"
                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                    ?: error("Unable to read selected image")
                repo.uploadLogo(fname, mime, bytes).getOrThrow()
            }.onSuccess { updated ->
                logoUrl = updated.logoUrl
                feedback = "Business logo updated."
            }.onFailure {
                feedback = ApiErrorParser.message(it, "Logo upload failed")
            }
        }
    }

    val restorePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            runCatching {
                val fname = context.contentResolver.query(uri, null, null, null, null)?.use { c ->
                    val idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (c.moveToFirst() && idx >= 0) c.getString(idx) else "backup.json"
                } ?: "backup.json"
                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                    ?: error("Unable to read backup file")
                repo.restoreCloudBackup(fname, bytes).getOrThrow()
            }.onSuccess { feedback = "Backup restored successfully." }
                .onFailure { feedback = ApiErrorParser.message(it, "Restore failed") }
        }
    }

    LaunchedEffect(Unit) {
        repo.getSettings().onSuccess { s ->
            name = s.name
            industry = s.industry ?: ""
            currency = s.currency
            email = s.ownerEmail ?: ""
            if (summaryRecipient.isBlank() && !s.ownerEmail.isNullOrBlank()) {
                summaryRecipient = s.ownerEmail
            }
            phone = s.phone ?: ""
            address = s.address ?: ""
            taxId = s.taxId ?: ""
            regNumber = s.registrationNumber ?: ""
            website = s.website ?: ""
            timezone = s.timezone ?: ""
            logoUrl = s.logoUrl
            taxEnabled = s.taxEnabled
            taxRate = s.taxRate.toString()
            taxLabel = s.taxLabel
            aiStyle = s.aiResponseStyle
        }
        loading = false
    }

    LaunchedEffect(tab) {
        if (tab == SettingsTab.AUDIT) {
            repo.getAuditLog().onSuccess { auditEntries = it }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.surface),
    ) {
        TopAppBar(
            title = { Text("Settings", style = CoopType.titleMd) },
            navigationIcon = {
                IconButton(onClick = onBack) { Icon(Icons.Rounded.ArrowBack, contentDescription = "Back") }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = palette.surfaceContainerLowest),
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(palette.surfaceContainerLowest)
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = CoopSpacing.md, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            SettingsTab.entries.forEach { t ->
                FilterChip(
                    selected = tab == t,
                    onClick = { tab = t },
                    label = { Text(t.label) },
                )
            }
        }
        HorizontalDivider(color = palette.borderSubtle)

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(CoopSpacing.md),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (feedback != null) {
                item {
                    CoopCard(backgroundColor = palette.surfaceContainerLow, contentPadding = 12.dp) {
                        Text(feedback!!, style = CoopType.bodyCompact, color = palette.primary)
                    }
                }
            }

            when (tab) {
                SettingsTab.COMPANY -> {
                    if (loading) {
                        item { CoopLoader() }
                    } else {
                        item {
                            CoopCard(modifier = Modifier.fillMaxWidth()) {
                                CoopSectionHeader(title = "Business Logo", subtitle = "Shown on invoices & header (PNG/JPG/WebP, max 5 MB)")
                                Spacer(modifier = Modifier.height(10.dp))
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(64.dp)
                                            .clip(RoundedCornerShape(CoopRadius.md))
                                            .background(palette.surfaceContainerLow),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        if (!logoUrl.isNullOrBlank()) {
                                            AsyncImage(
                                                model = logoUrl,
                                                contentDescription = "Business Logo",
                                                modifier = Modifier.fillMaxSize(),
                                                contentScale = ContentScale.Crop,
                                            )
                                        } else {
                                            Icon(Icons.Rounded.Store, contentDescription = null, tint = palette.outline)
                                        }
                                    }
                                    CoopSecondaryButton(
                                        text = if (logoUrl.isNullOrBlank()) "Upload Logo" else "Replace Logo",
                                        leadingIcon = Icons.Rounded.Upload,
                                        enabled = isOwner,
                                        modifier = Modifier.weight(1f),
                                        onClick = { logoPicker.launch("image/*") },
                                    )
                                }
                            }
                        }

                        item {
                            CoopCard(modifier = Modifier.fillMaxWidth()) {
                                CoopSectionHeader(title = "Business Profile & Tax")
                                Spacer(modifier = Modifier.height(10.dp))
                                CoopTextField(value = name, onValueChange = { name = it }, label = "Business Name", enabled = isOwner)
                                Spacer(modifier = Modifier.height(8.dp))
                                CoopTextField(value = industry, onValueChange = { industry = it }, label = "Industry", enabled = isOwner)
                                Spacer(modifier = Modifier.height(8.dp))
                                Text("CURRENCY", style = CoopType.labelCaps, color = palette.outline)
                                Spacer(modifier = Modifier.height(6.dp))
                                Row(
                                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                ) {
                                    listOf("USD", "NGN", "GBP", "EUR", "KES", "GHS", "ZAR", "CAD").forEach { c ->
                                        FilterChip(selected = currency == c, onClick = { if (isOwner) currency = c }, label = { Text(c) })
                                    }
                                }
                                Spacer(modifier = Modifier.height(8.dp))
                                CoopTextField(value = email, onValueChange = { email = it }, label = "Business Contact Email", enabled = isOwner)
                                Spacer(modifier = Modifier.height(8.dp))
                                CoopTextField(value = phone, onValueChange = { phone = it }, label = "Phone", enabled = isOwner)
                                Spacer(modifier = Modifier.height(8.dp))
                                CoopTextField(value = website, onValueChange = { website = it }, label = "Website", placeholder = "https://...", enabled = isOwner)
                                Spacer(modifier = Modifier.height(8.dp))
                                CoopTextField(value = timezone, onValueChange = { timezone = it }, label = "Timezone", placeholder = "Africa/Lagos, UTC, America/New_York", enabled = isOwner)
                                Spacer(modifier = Modifier.height(8.dp))
                                CoopTextField(value = address, onValueChange = { address = it }, label = "Address", enabled = isOwner, singleLine = false)
                                Spacer(modifier = Modifier.height(8.dp))
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    CoopTextField(value = taxId, onValueChange = { taxId = it }, label = "Tax ID", enabled = isOwner, modifier = Modifier.weight(1f))
                                    CoopTextField(value = regNumber, onValueChange = { regNumber = it }, label = "Reg #", enabled = isOwner, modifier = Modifier.weight(1f))
                                }
                                Spacer(modifier = Modifier.height(12.dp))
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text("Enable Tax / VAT on Orders", style = CoopType.bodyCompact.copy(fontWeight = FontWeight.SemiBold))
                                    Switch(checked = taxEnabled, onCheckedChange = { if (isOwner) taxEnabled = it })
                                }
                                if (taxEnabled) {
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        CoopTextField(
                                            value = taxLabel,
                                            onValueChange = { taxLabel = it },
                                            label = "Tax Label",
                                            enabled = isOwner,
                                            modifier = Modifier.weight(1f),
                                        )
                                        CoopTextField(
                                            value = taxRate,
                                            onValueChange = { taxRate = it },
                                            label = "Rate (%)",
                                            enabled = isOwner,
                                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                            modifier = Modifier.weight(1f),
                                        )
                                    }
                                }
                                if (isOwner) {
                                    Spacer(modifier = Modifier.height(14.dp))
                                    CoopPrimaryButton(
                                        text = "Save Company Settings",
                                        modifier = Modifier.fillMaxWidth(),
                                        onClick = {
                                            scope.launch {
                                                repo.updateSettings(
                                                    BusinessSettingsUpdateDto(
                                                        name = name.trim().takeIf { it.isNotBlank() },
                                                        industry = industry.trim().takeIf { it.isNotBlank() },
                                                        currency = currency,
                                                        ownerEmail = email.trim().takeIf { it.isNotBlank() },
                                                        phone = phone.trim().takeIf { it.isNotBlank() },
                                                        address = address.trim().takeIf { it.isNotBlank() },
                                                        taxId = taxId.trim().takeIf { it.isNotBlank() },
                                                        registrationNumber = regNumber.trim().takeIf { it.isNotBlank() },
                                                        website = website.trim().takeIf { it.isNotBlank() },
                                                        timezone = timezone.trim().takeIf { it.isNotBlank() },
                                                        taxEnabled = taxEnabled,
                                                        taxRate = taxRate.toDoubleOrNull() ?: 0.0,
                                                        taxLabel = taxLabel.trim().ifBlank { "Tax" },
                                                    ),
                                                ).onSuccess { feedback = "Settings saved." }
                                                    .onFailure { feedback = ApiErrorParser.message(it) }
                                            }
                                        },
                                    )
                                }
                            }
                        }
                    }
                }

                SettingsTab.APPEARANCE -> {
                    item {
                        CoopCard(modifier = Modifier.fillMaxWidth()) {
                            CoopSectionHeader(title = "Appearance", subtitle = "Co-op Purple light & dark themes")
                            Spacer(modifier = Modifier.height(10.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                ThemeMode.entries.forEach { m ->
                                    FilterChip(
                                        selected = currentThemeMode == m,
                                        onClick = { sessionManager.setThemeMode(m) },
                                        label = { Text(m.label) },
                                    )
                                }
                            }
                        }
                    }

                    item {
                        CoopCard(modifier = Modifier.fillMaxWidth()) {
                            CoopSectionHeader(title = "Zeno Answer Style", subtitle = "Controls AI prompt verbosity")
                            Spacer(modifier = Modifier.height(10.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                listOf("concise", "standard", "detailed").forEach { style ->
                                    FilterChip(
                                        selected = aiStyle == style,
                                        onClick = {
                                            aiStyle = style
                                            if (isOwner) {
                                                scope.launch {
                                                    repo.updateSettings(BusinessSettingsUpdateDto(aiResponseStyle = style))
                                                        .onSuccess { feedback = "AI style updated to $style." }
                                                }
                                            }
                                        },
                                        label = { Text(style.replaceFirstChar { it.uppercase() }) },
                                    )
                                }
                            }
                        }
                    }

                    item {
                        CoopCard(modifier = Modifier.fillMaxWidth()) {
                            CoopSectionHeader(title = "About & Server")
                            Spacer(modifier = Modifier.height(8.dp))
                            Text("Version ${BuildConfig.VERSION_NAME} (${BuildConfig.APP_ENV})", style = CoopType.bodyCompact)
                            Spacer(modifier = Modifier.height(8.dp))
                            CoopTextField(value = serverUrl, onValueChange = { serverUrl = it }, label = "API Base URL")
                            Spacer(modifier = Modifier.height(8.dp))
                            CoopSecondaryButton(
                                text = "Update Server URL",
                                onClick = {
                                    sessionManager.setServerUrl(serverUrl)
                                    feedback = "Server URL updated."
                                },
                            )
                        }
                    }
                }

                SettingsTab.NOTIFICATIONS -> {
                    item {
                        CoopCard(modifier = Modifier.fillMaxWidth()) {
                            CoopSectionHeader(
                                title = "In-App Notification Center",
                                subtitle = "Controls what the notification bell displays",
                            )
                            Spacer(modifier = Modifier.height(10.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text("Daily Summary", style = CoopType.bodyCompact.copy(fontWeight = FontWeight.SemiBold))
                                    Text("Today's revenue, orders, and receivables.", style = CoopType.labelCaps.copy(fontWeight = FontWeight.Normal), color = palette.outline)
                                }
                                Switch(
                                    checked = sessionState.notifDailySummary,
                                    onCheckedChange = { sessionManager.setNotificationPrefs(dailySummary = it) },
                                )
                            }
                            Spacer(modifier = Modifier.height(10.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text("Stock Alerts", style = CoopType.bodyCompact.copy(fontWeight = FontWeight.SemiBold))
                                    Text("Low-stock and out-of-stock highlights.", style = CoopType.labelCaps.copy(fontWeight = FontWeight.Normal), color = palette.outline)
                                }
                                Switch(
                                    checked = sessionState.notifLowStock,
                                    onCheckedChange = { sessionManager.setNotificationPrefs(lowStock = it) },
                                )
                            }
                        }
                    }

                    item {
                        CoopCard(modifier = Modifier.fillMaxWidth()) {
                            CoopSectionHeader(
                                title = "Email Today's Summary",
                                subtitle = "Send verified daily snapshot via configured SMTP",
                            )
                            Spacer(modifier = Modifier.height(10.dp))
                            if (!isOwnerOrManager) {
                                Text(
                                    "Only the business owner or a manager can send email summaries.",
                                    style = CoopType.bodyCompact,
                                    color = palette.outline,
                                )
                            } else {
                                CoopTextField(
                                    value = summaryRecipient,
                                    onValueChange = { summaryRecipient = it },
                                    label = "Recipient Email",
                                    placeholder = "owner@business.com",
                                )
                                Spacer(modifier = Modifier.height(10.dp))
                                CoopPrimaryButton(
                                    text = "Send Daily Summary Email",
                                    leadingIcon = Icons.Rounded.Send,
                                    loading = sendingEmail,
                                    enabled = summaryRecipient.contains("@"),
                                    modifier = Modifier.fillMaxWidth(),
                                    onClick = {
                                        sendingEmail = true
                                        scope.launch {
                                            feedbackRepo.sendDailySummaryEmail(summaryRecipient.trim())
                                                .onSuccess { feedback = "Daily summary emailed to ${summaryRecipient.trim()}." }
                                                .onFailure { err ->
                                                    val msg = ApiErrorParser.message(err)
                                                    feedback = if (msg.contains("503") || msg.contains("SMTP", ignoreCase = true)) {
                                                        "Email delivery isn't configured on this deployment — in-app summary still works."
                                                    } else msg
                                                }
                                            sendingEmail = false
                                        }
                                    },
                                )
                            }
                        }
                    }
                }

                SettingsTab.SECURITY -> {
                    item {
                        CoopCard(modifier = Modifier.fillMaxWidth()) {
                            CoopSectionHeader(
                                title = "Account Security (Clerk)",
                                subtitle = "Co-op never stores passwords locally",
                            )
                            Spacer(modifier = Modifier.height(10.dp))
                            Text(
                                text = "Password, two-factor authentication (2FA), and active sessions are managed directly by Clerk.",
                                style = CoopType.bodyCompact,
                                color = palette.onSurfaceVariant,
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "Signed in as: ${sessionState.email ?: sessionState.userId ?: "Offline Demo"}",
                                style = CoopType.bodyCompact.copy(fontWeight = FontWeight.SemiBold),
                                color = palette.onSurface,
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            CoopPrimaryButton(
                                text = "Manage Account Security",
                                leadingIcon = Icons.Rounded.Key,
                                modifier = Modifier.fillMaxWidth(),
                                onClick = {
                                    val base = sessionManager.getServerUrl().removeSuffix("/api")
                                    runCatching {
                                        CustomTabsIntent.Builder().build().launchUrl(context, Uri.parse("$base/settings"))
                                    }.onFailure {
                                        feedback = "Open $base/settings in a browser to manage Clerk security."
                                    }
                                },
                            )
                        }
                    }
                }

                SettingsTab.BACKUP -> {
                    item {
                        CoopCard(modifier = Modifier.fillMaxWidth()) {
                            CoopSectionHeader(
                                title = "Cloud JSON Backup & Restore",
                                subtitle = "Owner-only full business snapshot",
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            CoopPrimaryButton(
                                text = "Export & Share JSON Snapshot",
                                leadingIcon = Icons.Rounded.Download,
                                enabled = isOwner,
                                modifier = Modifier.fillMaxWidth(),
                                onClick = {
                                    scope.launch {
                                        repo.exportCloudBackup()
                                            .onSuccess { bytes ->
                                                val dir = File(context.cacheDir, "backups").apply { mkdirs() }
                                                val file = File(dir, "coop_backup.json")
                                                file.writeBytes(bytes)
                                                val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
                                                val intent = Intent(Intent.ACTION_SEND).apply {
                                                    type = "application/json"
                                                    putExtra(Intent.EXTRA_STREAM, uri)
                                                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                                }
                                                context.startActivity(Intent.createChooser(intent, "Save Co-op Backup"))
                                            }
                                            .onFailure { feedback = ApiErrorParser.message(it) }
                                    }
                                },
                            )
                            Spacer(modifier = Modifier.height(10.dp))
                            CoopSecondaryButton(
                                text = "Restore Into Empty Business",
                                leadingIcon = Icons.Rounded.Restore,
                                enabled = isOwner,
                                modifier = Modifier.fillMaxWidth(),
                                onClick = { restorePicker.launch(arrayOf("application/json")) },
                            )
                        }
                    }
                }

                SettingsTab.AUDIT -> {
                    if (auditEntries.isEmpty()) {
                        item {
                            CoopEmptyState(
                                title = "No audit records",
                                message = "Every mutation in Co-op records an append-only audit trail entry.",
                                icon = Icons.Rounded.VerifiedUser,
                            )
                        }
                    } else {
                        items(auditEntries, key = { it.id }) { row ->
                            CoopCard(modifier = Modifier.fillMaxWidth()) {
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text("${row.tableName} · ${row.action}", style = CoopType.titleMd)
                                    Text(row.createdAt?.take(16) ?: "", style = CoopType.labelCaps, color = palette.outline)
                                }
                                row.change?.let {
                                    Spacer(modifier = Modifier.height(4.dp))
                                    Text(it, style = CoopType.bodyCompact, color = palette.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
