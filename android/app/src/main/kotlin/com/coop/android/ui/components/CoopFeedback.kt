package com.coop.android.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CloudDone
import androidx.compose.material.icons.rounded.CloudOff
import androidx.compose.material.icons.rounded.CloudSync
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Inbox
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.coop.android.ui.theme.CoopRadius
import com.coop.android.ui.theme.CoopSpacing
import com.coop.android.ui.theme.CoopThemeTokens
import com.coop.android.ui.theme.CoopType
import com.coop.android.ui.theme.tint

@Composable
fun CoopLoader(
    label: String? = null,
    modifier: Modifier = Modifier,
) {
    val palette = CoopThemeTokens.colors
    Column(
        modifier = modifier.padding(CoopSpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        CircularProgressIndicator(
            color = palette.primary,
            strokeWidth = 3.dp,
            modifier = Modifier.size(32.dp),
        )
        if (!label.isNullOrBlank()) {
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = label,
                style = CoopType.bodyCompact,
                color = palette.onSurfaceVariant,
            )
        }
    }
}

@Composable
fun CoopEmptyState(
    title: String,
    message: String,
    modifier: Modifier = Modifier,
    icon: ImageVector = Icons.Rounded.Inbox,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    val palette = CoopThemeTokens.colors
    CoopCard(modifier = modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = CoopSpacing.md),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                modifier = Modifier
                    .size(52.dp)
                    .clip(CircleShape)
                    .background(palette.primary.tint(0.10f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = palette.primary,
                    modifier = Modifier.size(26.dp),
                )
            }
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = title,
                style = CoopType.titleMd,
                color = palette.onSurface,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = message,
                style = CoopType.bodyCompact,
                color = palette.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            if (!actionLabel.isNullOrBlank() && onAction != null) {
                Spacer(modifier = Modifier.height(16.dp))
                CoopPrimaryButton(text = actionLabel, onClick = onAction)
            }
        }
    }
}

@Composable
fun CoopErrorState(
    message: String,
    onRetry: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val palette = CoopThemeTokens.colors
    CoopCard(
        modifier = modifier.fillMaxWidth(),
        borderColor = palette.error.tint(0.35f),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(
                imageVector = Icons.Rounded.ErrorOutline,
                contentDescription = null,
                tint = palette.error,
                modifier = Modifier.size(24.dp),
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Something went wrong",
                    style = CoopType.titleMd,
                    color = palette.onSurface,
                )
                Text(
                    text = message,
                    style = CoopType.bodyCompact,
                    color = palette.onSurfaceVariant,
                )
            }
        }
        if (onRetry != null) {
            Spacer(modifier = Modifier.height(12.dp))
            CoopSecondaryButton(text = "Retry", onClick = onRetry)
        }
    }
}

@Composable
fun CoopOfflineBanner(
    pendingCount: Int = 0,
    conflictCount: Int = 0,
    onClick: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val palette = CoopThemeTokens.colors
    val shape = RoundedCornerShape(CoopRadius.lg)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(palette.warning.tint(if (palette.isDark) 0.16f else 0.12f))
            .border(1.dp, palette.warning.tint(0.35f), shape)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Rounded.CloudOff,
            contentDescription = "Offline",
            tint = palette.warning,
            modifier = Modifier.size(18.dp),
        )
        Spacer(modifier = Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "Offline mode — local mirror active",
                style = CoopType.bodyCompact.copy(fontWeight = FontWeight.SemiBold),
                color = palette.onSurface,
            )
            val details = buildString {
                append("Changes are saved locally and sync automatically when online.")
                if (pendingCount > 0) append(" $pendingCount pending.")
                if (conflictCount > 0) append(" $conflictCount conflicts.")
            }
            Text(
                text = details,
                style = CoopType.labelCaps.copy(fontWeight = FontWeight.Normal),
                color = palette.onSurfaceVariant,
            )
        }
    }
}

@Composable
fun CoopSyncStatusChip(
    isOnline: Boolean,
    isSyncing: Boolean,
    pendingCount: Int,
    conflictCount: Int,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = CoopThemeTokens.colors
    val (icon, tintColor, label) = when {
        conflictCount > 0 -> Triple(Icons.Rounded.WarningAmber, palette.error, "$conflictCount conflict")
        isSyncing -> Triple(Icons.Rounded.CloudSync, palette.primary, "Syncing")
        !isOnline -> Triple(Icons.Rounded.CloudOff, palette.warning, if (pendingCount > 0) "Offline ($pendingCount)" else "Offline")
        pendingCount > 0 -> Triple(Icons.Rounded.CloudSync, palette.warning, "$pendingCount pending")
        else -> Triple(Icons.Rounded.CloudDone, palette.success, "Synced")
    }
    val shape = RoundedCornerShape(CoopRadius.full)
    Row(
        modifier = modifier
            .clip(shape)
            .background(tintColor.tint(if (palette.isDark) 0.18f else 0.10f))
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = label,
            tint = tintColor,
            modifier = Modifier.size(15.dp),
        )
        Text(
            text = label,
            style = CoopType.labelCaps,
            color = tintColor,
            maxLines = 1,
        )
    }
}
