package com.coop.android.ui.screens.team

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
import androidx.compose.ui.unit.dp
import com.coop.android.core.auth.WriteMatrix
import com.coop.android.core.network.ApiErrorParser
import com.coop.android.core.network.dto.TeamResponseDto
import com.coop.android.data.repository.IdentityTeamRepository
import com.coop.android.ui.components.*
import com.coop.android.ui.theme.CoopSpacing
import com.coop.android.ui.theme.CoopThemeTokens
import com.coop.android.ui.theme.CoopType
import kotlinx.coroutines.launch

@Composable
fun TeamScreen(
    repo: IdentityTeamRepository,
    currentRole: String,
    onBack: () -> Unit,
) {
    val palette = CoopThemeTokens.colors
    val scope = rememberCoroutineScope()
    val isOwner = WriteMatrix.isOwner(currentRole)

    var loading by remember { mutableStateOf(true) }
    var team by remember { mutableStateOf<TeamResponseDto?>(null) }
    var showInviteDialog by remember { mutableStateOf(false) }
    var roleEditingMemberId by remember { mutableStateOf<String?>(null) }
    var feedback by remember { mutableStateOf<String?>(null) }

    fun load() {
        scope.launch {
            loading = true
            repo.getTeam()
                .onSuccess { team = it }
                .onFailure { feedback = ApiErrorParser.message(it) }
            loading = false
        }
    }

    LaunchedEffect(Unit) { load() }

    Scaffold(
        containerColor = palette.surface,
        topBar = {
            TopAppBar(
                title = { Text("Team & Roles", style = CoopType.titleMd) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Rounded.ArrowBack, contentDescription = "Back") }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = palette.surfaceContainerLowest),
            )
        },
        floatingActionButton = {
            if (isOwner) {
                FloatingActionButton(
                    onClick = { showInviteDialog = true },
                    containerColor = palette.primary,
                    contentColor = palette.onPrimary,
                ) {
                    Icon(Icons.Rounded.PersonAdd, contentDescription = "Invite Member")
                }
            }
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(CoopSpacing.md),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (feedback != null) {
                item { Text(feedback!!, style = CoopType.bodyCompact, color = palette.primary) }
            }
            if (loading) {
                item { CoopLoader() }
            } else if (team != null) {
                val t = team!!
                item { CoopSectionHeader(title = "Members (${t.members.size})") }
                if (t.members.isEmpty()) {
                    item {
                        CoopEmptyState(
                            title = "Only you so far",
                            message = "Invite managers, sales, inventory staff, accountants, or read-only viewers.",
                            icon = Icons.Rounded.GroupAdd,
                        )
                    }
                } else {
                    items(t.members, key = { it.userId }) { m ->
                        CoopCard(modifier = Modifier.fillMaxWidth()) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(m.email ?: m.userId, style = CoopType.titleMd)
                                    Text(WriteMatrix.roleLabels[m.role] ?: m.role, style = CoopType.bodyCompact, color = palette.onSurfaceVariant)
                                }
                                CoopStatusPill(text = m.role, tone = PillTone.INFO)
                            }
                            if (isOwner && m.role != "owner") {
                                Spacer(modifier = Modifier.height(8.dp))
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Box {
                                        CoopSecondaryButton(
                                            text = "Change Role",
                                            leadingIcon = Icons.Rounded.ManageAccounts,
                                            onClick = { roleEditingMemberId = m.userId },
                                        )
                                        DropdownMenu(
                                            expanded = roleEditingMemberId == m.userId,
                                            onDismissRequest = { roleEditingMemberId = null },
                                        ) {
                                            WriteMatrix.teamRoles.forEach { targetRole ->
                                                DropdownMenuItem(
                                                    text = {
                                                        Text(
                                                            WriteMatrix.roleLabels[targetRole] ?: targetRole,
                                                            style = CoopType.bodyCompact,
                                                        )
                                                    },
                                                    trailingIcon = if (m.role == targetRole) {
                                                        { Icon(Icons.Rounded.Check, contentDescription = null) }
                                                    } else null,
                                                    onClick = {
                                                        roleEditingMemberId = null
                                                        if (targetRole != m.role) {
                                                            scope.launch {
                                                                repo.updateMemberRole(m.userId, targetRole)
                                                                    .onSuccess {
                                                                        feedback = "Role updated to ${WriteMatrix.roleLabels[targetRole] ?: targetRole}."
                                                                        load()
                                                                    }
                                                                    .onFailure { feedback = ApiErrorParser.message(it) }
                                                            }
                                                        }
                                                    },
                                                )
                                            }
                                        }
                                    }
                                    CoopGhostButton(
                                        text = "Remove Member",
                                        textColor = palette.error,
                                        onClick = {
                                            scope.launch {
                                                repo.removeMember(m.userId)
                                                    .onSuccess { load() }
                                                    .onFailure { feedback = ApiErrorParser.message(it) }
                                            }
                                        },
                                    )
                                }
                            }
                        }
                    }
                }

                if (t.invitations.isNotEmpty()) {
                    item { CoopSectionHeader(title = "Pending Invitations (${t.invitations.size})") }
                    items(t.invitations, key = { it.token }) { inv ->
                        CoopCard(modifier = Modifier.fillMaxWidth()) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Column {
                                    Text(inv.email, style = CoopType.titleMd)
                                    Text("Role: ${inv.role}", style = CoopType.bodyCompact, color = palette.outline)
                                }
                                CoopStatusPill(text = inv.status, tone = PillTone.WARNING)
                            }
                            if (isOwner) {
                                Spacer(modifier = Modifier.height(6.dp))
                                CoopGhostButton(
                                    text = "Revoke Invite",
                                    textColor = palette.error,
                                    onClick = {
                                        scope.launch {
                                            repo.revokeInvite(inv.token)
                                                .onSuccess { load() }
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
    }

    if (showInviteDialog) {
        var email by remember { mutableStateOf("") }
        var role by remember { mutableStateOf("sales") }
        AlertDialog(
            onDismissRequest = { showInviteDialog = false },
            title = { Text("Invite Team Member", style = CoopType.sectionHeading) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    CoopTextField(value = email, onValueChange = { email = it }, label = "Member Email")
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        WriteMatrix.teamRoles.forEach { r ->
                            FilterChip(selected = role == r, onClick = { role = r }, label = { Text(r) })
                        }
                    }
                }
            },
            confirmButton = {
                CoopPrimaryButton(
                    text = "Send Invite",
                    enabled = email.contains("@"),
                    onClick = {
                        scope.launch {
                            repo.createInvite(email, role)
                                .onSuccess {
                                    showInviteDialog = false
                                    feedback = "Invitation created for ${it.email}."
                                    load()
                                }
                                .onFailure { feedback = ApiErrorParser.message(it) }
                        }
                    },
                )
            },
            dismissButton = { CoopGhostButton(text = "Cancel", onClick = { showInviteDialog = false }) },
        )
    }
}
