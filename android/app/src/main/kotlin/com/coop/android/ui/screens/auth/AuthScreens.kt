package com.coop.android.ui.screens.auth

import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.coop.android.core.auth.SessionManager
import com.coop.android.core.auth.SessionState
import com.coop.android.core.network.ApiErrorParser
import com.coop.android.core.network.dto.TeamInviteOutDto
import com.coop.android.core.sync.SyncEngine
import com.coop.android.data.repository.IdentityTeamRepository
import com.coop.android.ui.components.*
import com.coop.android.ui.theme.CoopRadius
import com.coop.android.ui.theme.CoopSpacing
import com.coop.android.ui.theme.CoopThemeTokens
import com.coop.android.ui.theme.CoopType
import com.coop.android.ui.theme.tint
import kotlinx.coroutines.launch

@Composable
fun SignInScreen(
    sessionManager: SessionManager,
    sessionState: SessionState,
    identityRepo: IdentityTeamRepository,
    syncEngine: SyncEngine,
    onSignedIn: () -> Unit,
) {
    val palette = CoopThemeTokens.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var serverUrl by remember(sessionState.serverUrl) { mutableStateOf(sessionState.serverUrl) }
    var email by remember { mutableStateOf(sessionState.email ?: "") }
    var sessionToken by remember { mutableStateOf("") }
    var showToken by remember { mutableStateOf(false) }
    var showServerSettings by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.surface)
            .statusBarsPadding()
            .navigationBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = CoopSpacing.lg, vertical = CoopSpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Spacer(modifier = Modifier.height(16.dp))

        if (sessionState.sessionExpiredNotice) {
            CoopCard(
                modifier = Modifier.fillMaxWidth(),
                backgroundColor = palette.primary.tint(0.08f),
                borderColor = palette.primary.tint(0.25f),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Icon(Icons.Rounded.Info, contentDescription = null, tint = palette.primary)
                    Text(
                        text = "Your session has expired. Please sign in again.",
                        style = CoopType.bodyCompact,
                        color = palette.onSurfaceVariant,
                    )
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
        }

        CoopCard(
            modifier = Modifier.fillMaxWidth(),
            contentPadding = CoopSpacing.lg,
        ) {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                CoopLogo(markSize = 44.dp, subtitle = "Business Advisor")
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = "Sign in to Co-op",
                    style = CoopType.pageTitleMobile,
                    color = palette.onSurface,
                    textAlign = TextAlign.Center,
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Offline-first retail operations & Zeno AI",
                    style = CoopType.bodyCompact,
                    color = palette.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
            }

            Spacer(modifier = Modifier.height(20.dp))

            if (error != null) {
                CoopCard(
                    backgroundColor = palette.error.tint(0.08f),
                    borderColor = palette.error.tint(0.3f),
                    contentPadding = 12.dp,
                ) {
                    Text(text = error!!, style = CoopType.bodyCompact, color = palette.error)
                }
                Spacer(modifier = Modifier.height(12.dp))
            }

            CoopTextField(
                value = email,
                onValueChange = { email = it },
                label = "Work email",
                placeholder = "owner@business.com",
            )
            Spacer(modifier = Modifier.height(12.dp))

            CoopTextField(
                value = sessionToken,
                onValueChange = { sessionToken = it },
                label = "Clerk Session / API Bearer Token",
                placeholder = "Paste JWT session token...",
                visualTransformation = if (showToken) VisualTransformation.None else PasswordVisualTransformation(),
                trailingIcon = {
                    IconButton(onClick = { showToken = !showToken }) {
                        Icon(
                            imageVector = if (showToken) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility,
                            contentDescription = "Toggle visibility",
                        )
                    }
                },
                supportingText = "Connects directly to your FastAPI backend via Clerk RS256 Bearer auth.",
            )

            Spacer(modifier = Modifier.height(8.dp))
            CoopGhostButton(
                text = if (showServerSettings) "Hide server URL" else "Configure backend server URL",
                leadingIcon = Icons.Rounded.Dns,
                onClick = { showServerSettings = !showServerSettings },
            )

            if (showServerSettings) {
                Spacer(modifier = Modifier.height(8.dp))
                CoopTextField(
                    value = serverUrl,
                    onValueChange = { serverUrl = it },
                    label = "Backend API URL",
                    placeholder = "https://api.coop.app or http://10.0.2.2:8000",
                )
            }

            Spacer(modifier = Modifier.height(16.dp))
            CoopPrimaryButton(
                text = "Sign in to Workspace",
                leadingIcon = Icons.Rounded.Login,
                loading = loading,
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    error = null
                    if (sessionToken.isBlank()) {
                        error = "Enter a valid Clerk session token or launch Offline Demo Mode below."
                        return@CoopPrimaryButton
                    }
                    loading = true
                    sessionManager.setServerUrl(serverUrl)
                    sessionManager.signInWithToken(sessionToken, email.takeIf { it.isNotBlank() })
                    scope.launch {
                        val res = identityRepo.fetchMe()
                        loading = false
                        res.onSuccess {
                            syncEngine.syncNow()
                            onSignedIn()
                        }.onFailure { err ->
                            sessionManager.signOut()
                            error = ApiErrorParser.message(err, "Could not verify token against backend.")
                        }
                    }
                },
            )

            Spacer(modifier = Modifier.height(10.dp))
            CoopSecondaryButton(
                text = "Open Web Sign-In (Clerk)",
                leadingIcon = Icons.Rounded.OpenInBrowser,
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    val clean = serverUrl.trim().trimEnd('/')
                    runCatching {
                        CustomTabsIntent.Builder().build().launchUrl(context, Uri.parse("$clean/sign-in"))
                    }.onFailure {
                        error = "Unable to open browser for $clean"
                    }
                },
            )

            Spacer(modifier = Modifier.height(16.dp))
            HorizontalDivider(color = palette.borderSubtle)
            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = "TRY WITHOUT A SERVER",
                style = CoopType.labelCaps,
                color = palette.outline,
            )
            Spacer(modifier = Modifier.height(8.dp))
            CoopAiButton(
                text = "Explore Offline Demo Store",
                modifier = Modifier.fillMaxWidth(),
                loading = loading,
                onClick = {
                    loading = true
                    scope.launch {
                        syncEngine.seedDemoDataIfEmpty()
                        sessionManager.signInDemoOffline()
                        loading = false
                        onSignedIn()
                    }
                },
            )
        }

        Spacer(modifier = Modifier.height(20.dp))
        Text(
            text = "© 2026 CO OP SaaS. All rights reserved.",
            style = CoopType.bodyCompact,
            color = palette.outline,
        )
    }
}

@Composable
fun WelcomeOnboardingScreen(
    businessName: String,
    onGoImport: () -> Unit,
    onStartScratch: () -> Unit,
) {
    val palette = CoopThemeTokens.colors
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.surface)
            .statusBarsPadding()
            .navigationBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(CoopSpacing.lg),
        verticalArrangement = Arrangement.Center,
    ) {
        CoopLogo(markSize = 40.dp)
        Spacer(modifier = Modifier.height(24.dp))
        Text(
            text = "Welcome to Co-op${if (businessName.isNotBlank()) ", $businessName" else ""}",
            style = CoopType.pageTitleMobile,
            color = palette.onSurface,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Bring your existing products, customers, and orders in seconds — or start fresh and record your first sale right away.",
            style = CoopType.bodyDefault,
            color = palette.onSurfaceVariant,
        )
        Spacer(modifier = Modifier.height(24.dp))

        CoopAiCard(
            title = "Intelligent Import",
            badgeText = "Recommended",
        ) {
            Text(
                text = "Upload a CSV from your old POS or spreadsheet. Co-op detects columns, validates every row in a dry run, and generates your Day 1 Briefing automatically.",
                style = CoopType.bodyCompact,
                color = palette.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(16.dp))
            CoopPrimaryButton(
                text = "Import Business History",
                leadingIcon = Icons.Rounded.UploadFile,
                modifier = Modifier.fillMaxWidth(),
                onClick = onGoImport,
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        CoopCard(modifier = Modifier.fillMaxWidth()) {
            Text(
                text = "Start from scratch",
                style = CoopType.titleMd,
                color = palette.onSurface,
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Jump straight into your Dashboard and add products, customers, and orders manually.",
                style = CoopType.bodyCompact,
                color = palette.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(12.dp))
            CoopSecondaryButton(
                text = "Open Dashboard",
                leadingIcon = Icons.Rounded.Dashboard,
                modifier = Modifier.fillMaxWidth(),
                onClick = onStartScratch,
            )
        }
    }
}

@Composable
fun InviteAcceptScreen(
    invite: TeamInviteOutDto,
    onAccept: () -> Unit,
    onDeclineSignOut: () -> Unit,
) {
    val palette = CoopThemeTokens.colors
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.surface)
            .padding(CoopSpacing.lg),
        contentAlignment = Alignment.Center,
    ) {
        CoopCard(modifier = Modifier.fillMaxWidth(), contentPadding = CoopSpacing.lg) {
            CoopStatusPill(text = "Team Invitation", tone = PillTone.INFO)
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = "Join ${invite.businessName.ifBlank { "this workspace" }}",
                style = CoopType.pageTitleMobile,
                color = palette.onSurface,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "You were invited as ${invite.role.replaceFirstChar { it.uppercase() }} (${invite.email}). Accepting attaches your account to this business.",
                style = CoopType.bodyCompact,
                color = palette.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(20.dp))
            CoopPrimaryButton(
                text = "Accept Invitation",
                leadingIcon = Icons.Rounded.Check,
                modifier = Modifier.fillMaxWidth(),
                onClick = onAccept,
            )
            Spacer(modifier = Modifier.height(8.dp))
            CoopGhostButton(
                text = "Sign out",
                onClick = onDeclineSignOut,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
