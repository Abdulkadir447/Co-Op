package com.coop.android.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.coop.android.ui.theme.CoopAiBorderGradient
import com.coop.android.ui.theme.CoopRadius
import com.coop.android.ui.theme.CoopSpacing
import com.coop.android.ui.theme.CoopThemeTokens
import com.coop.android.ui.theme.CoopType
import com.coop.android.ui.theme.tint

@Composable
fun CoopCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    contentPadding: Dp = CoopSpacing.md,
    backgroundColor: Color = CoopThemeTokens.colors.surfaceContainerLowest,
    borderColor: Color = CoopThemeTokens.colors.borderSubtle,
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(CoopRadius.lg)
    Surface(
        modifier = modifier
            .clip(shape)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
        shape = shape,
        color = backgroundColor,
        border = BorderStroke(1.dp, borderColor),
        tonalElevation = 0.dp,
        shadowElevation = 0.dp,
    ) {
        Column(
            modifier = Modifier.padding(contentPadding),
            content = content,
        )
    }
}

@Composable
fun CoopAiCard(
    title: String? = null,
    badgeText: String? = "Zeno AI",
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val palette = CoopThemeTokens.colors
    val shape = RoundedCornerShape(CoopRadius.lg)
    Surface(
        modifier = modifier
            .clip(shape)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
        shape = shape,
        color = palette.surfaceContainerLowest,
        border = BorderStroke(1.dp, palette.borderSubtle),
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(3.dp)
                    .background(CoopAiBorderGradient),
            )
            Column(modifier = Modifier.padding(CoopSpacing.md)) {
                if (!title.isNullOrBlank() || !badgeText.isNullOrBlank()) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.AutoAwesome,
                                contentDescription = null,
                                tint = palette.secondary,
                                modifier = Modifier.size(18.dp),
                            )
                            if (!title.isNullOrBlank()) {
                                Text(
                                    text = title,
                                    style = CoopType.titleMd,
                                    color = palette.onSurface,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                        if (!badgeText.isNullOrBlank()) {
                            CoopStatusPill(text = badgeText, tone = PillTone.AI)
                        }
                    }
                    Spacer(modifier = Modifier.height(CoopSpacing.sm))
                }
                content()
            }
        }
    }
}

@Composable
fun CoopKpiCard(
    label: String,
    value: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    trendText: String? = null,
    trendTone: PillTone = PillTone.INFO,
    iconTint: Color = CoopThemeTokens.colors.primary,
    onClick: (() -> Unit)? = null,
) {
    val palette = CoopThemeTokens.colors
    CoopCard(
        modifier = modifier,
        onClick = onClick,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(CoopRadius.md))
                    .background(iconTint.tint(if (palette.isDark) 0.18f else 0.10f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = iconTint,
                    modifier = Modifier.size(20.dp),
                )
            }
            if (!trendText.isNullOrBlank()) {
                CoopStatusPill(text = trendText, tone = trendTone)
            }
        }
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = label.uppercase(),
            style = CoopType.labelCaps,
            color = palette.outline,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = value,
            style = CoopType.sectionHeading.copy(fontWeight = FontWeight.Bold),
            color = palette.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (!subtitle.isNullOrBlank()) {
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = subtitle,
                style = CoopType.bodyCompact,
                color = palette.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
