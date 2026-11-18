package com.coop.android.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

object CoopSpacing {
    val xs = 4.dp
    val sm = 8.dp
    val md = 16.dp
    val lg = 24.dp
    val xl = 32.dp
    val xxl = 48.dp
    val xxxl = 64.dp
}

object CoopRadius {
    val sm = 4.dp
    val md = 8.dp
    val lg = 12.dp
    val xl = 16.dp
    val full = 999.dp
}

val CoopShapes = Shapes(
    extraSmall = RoundedCornerShape(CoopRadius.sm),
    small = RoundedCornerShape(CoopRadius.md),
    medium = RoundedCornerShape(CoopRadius.lg),
    large = RoundedCornerShape(CoopRadius.xl),
    extraLarge = RoundedCornerShape(24.dp),
)
