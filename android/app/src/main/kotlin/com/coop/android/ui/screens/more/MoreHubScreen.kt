package com.coop.android.ui.screens.more

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.coop.android.core.auth.SessionState
import com.coop.android.core.auth.WriteMatrix
import com.coop.android.core.sync.SyncStatusState
import com.coop.android.ui.components.*
import com.coop.android.ui.navigation.CoopRoutes
import com.coop.android.ui.theme.CoopSpacing
import com.coop.android.ui.theme.CoopThemeTokens
import com.coop.android.ui.theme.CoopType

@Composable
fun MoreHubScreen(
    session: SessionState,
    syncStatus: SyncStatusState,
    onNavigate: (String) -> Unit,
    onSignOut: () -> Unit,
) {
    val palette = CoopThemeTokens.colors

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.surface),
        contentPadding = PaddingValues(CoopSpacing.md),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            CoopCard(modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = session.businessName.ifBlank { "My Business" },
                            style = CoopType.sectionHeading,
                            color = palette.onSurface,
                        )
                        Text(
                            text = session.email ?: (if (session.isDemoMode) "Offline Demo Account" else "Signed in"),
                            style = CoopType.bodyCompact,
                            color = palette.onSurfaceVariant,
                        )
                    }
                    CoopStatusPill(
                        text = WriteMatrix.roleLabels[session.role] ?: session.role,
                        tone = PillTone.INFO,
                    )
                }
            }
        }

        item { CoopSectionHeader(title = "Business Tools") }
        item {
            CoopCard(modifier = Modifier.fillMaxWidth(), contentPadding = 8.dp) {
                MoreMenuRow("Day 1 Morning Briefing", "Verified insights & drafts", Icons.Rounded.AutoGraph) {
                    onNavigate(CoopRoutes.BRIEFING)
                }
                HorizontalDivider(color = palette.borderSubtle)
                MoreMenuRow("Reports & Exports", "Sales, P&L, Inventory, Customers", Icons.Rounded.Assessment) {
                    onNavigate(CoopRoutes.REPORTS)
                }
                HorizontalDivider(color = palette.borderSubtle)
                MoreMenuRow("Invoices", "Sequential tax invoices & CSV", Icons.Rounded.ReceiptLong) {
                    onNavigate(CoopRoutes.INVOICES)
                }
                HorizontalDivider(color = palette.borderSubtle)
                MoreMenuRow("Receivables", "Unpaid balances & aging", Icons.Rounded.AccountBalanceWallet) {
                    onNavigate(CoopRoutes.RECEIVABLES)
                }
                HorizontalDivider(color = palette.borderSubtle)
                MoreMenuRow("Intelligent Import", "Import products, customers, orders", Icons.Rounded.UploadFile) {
                    onNavigate(CoopRoutes.IMPORT)
                }
            }
        }

        item { CoopSectionHeader(title = "Sync & Administration") }
        item {
            CoopCard(modifier = Modifier.fillMaxWidth(), contentPadding = 8.dp) {
                MoreMenuRow(
                    title = "Sync Center",
                    subtitle = "${syncStatus.pendingCount} pending · ${syncStatus.conflictCount} conflicts",
                    icon = Icons.Rounded.Sync,
                    badge = if (syncStatus.conflictCount > 0) "${syncStatus.conflictCount}!" else null,
                ) {
                    onNavigate(CoopRoutes.SYNC_CENTER)
                }
                HorizontalDivider(color = palette.borderSubtle)
                MoreMenuRow("Billing, Plans & Licences", "Credits, 10-day trial, Paystack", Icons.Rounded.CreditCard) {
                    onNavigate(CoopRoutes.BILLING)
                }
                HorizontalDivider(color = palette.borderSubtle)
                MoreMenuRow("Team & Roles", "Manage members & invitations", Icons.Rounded.Badge) {
                    onNavigate(CoopRoutes.TEAM)
                }
                HorizontalDivider(color = palette.borderSubtle)
                MoreMenuRow("Settings, Backup & Audit", "Company, tax, theme, audit log", Icons.Rounded.Settings) {
                    onNavigate(CoopRoutes.SETTINGS)
                }
            }
        }

        item { CoopSectionHeader(title = "Support & Platform") }
        item {
            CoopCard(modifier = Modifier.fillMaxWidth(), contentPadding = 8.dp) {
                MoreMenuRow("Feedback & Report an Issue", "Share feedback or file a bug", Icons.Rounded.SupportAgent) {
                    onNavigate(CoopRoutes.SUPPORT)
                }
                HorizontalDivider(color = palette.borderSubtle)
                MoreMenuRow("Platform Admin Console", "Cross-tenant & investor metrics", Icons.Rounded.AdminPanelSettings) {
                    onNavigate(CoopRoutes.PLATFORM_ADMIN)
                }
            }
        }

        item {
            Spacer(modifier = Modifier.height(4.dp))
            CoopDangerButton(
                text = "Sign Out",
                leadingIcon = Icons.Rounded.Logout,
                modifier = Modifier.fillMaxWidth(),
                onClick = onSignOut,
            )
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@Composable
private fun MoreMenuRow(
    title: String,
    subtitle: String,
    icon: ImageVector,
    badge: String? = null,
    onClick: () -> Unit,
) {
    val palette = CoopThemeTokens.colors
    Surface(
        onClick = onClick,
        color = palette.surfaceContainerLowest,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(icon, contentDescription = null, tint = palette.primary)
            Column(modifier = Modifier.weight(1f)) {
                Text(title, style = CoopType.bodyCompact.copy(fontWeight = FontWeight.SemiBold), color = palette.onSurface)
                Text(subtitle, style = CoopType.labelCaps.copy(fontWeight = FontWeight.Normal), color = palette.outline)
            }
            if (badge != null) {
                CoopStatusPill(text = badge, tone = PillTone.CRITICAL)
            }
            Icon(Icons.Rounded.ChevronRight, contentDescription = null, tint = palette.outline)
        }
    }
}
