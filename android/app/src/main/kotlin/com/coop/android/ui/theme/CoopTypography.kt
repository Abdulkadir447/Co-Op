package com.coop.android.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

object CoopType {
    private val fontFamily = FontFamily.SansSerif

    val pageTitle = TextStyle(
        fontFamily = fontFamily,
        fontSize = 32.sp,
        lineHeight = 40.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = (-0.02).em,
    )

    val pageTitleMobile = TextStyle(
        fontFamily = fontFamily,
        fontSize = 24.sp,
        lineHeight = 32.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = (-0.01).em,
    )

    val sectionHeading = TextStyle(
        fontFamily = fontFamily,
        fontSize = 20.sp,
        lineHeight = 28.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.sp,
    )

    val titleMd = TextStyle(
        fontFamily = fontFamily,
        fontSize = 16.sp,
        lineHeight = 24.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.sp,
    )

    val bodyDefault = TextStyle(
        fontFamily = fontFamily,
        fontSize = 16.sp,
        lineHeight = 24.sp,
        fontWeight = FontWeight.Normal,
        letterSpacing = 0.sp,
    )

    val bodyCompact = TextStyle(
        fontFamily = fontFamily,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        fontWeight = FontWeight.Normal,
        letterSpacing = 0.sp,
    )

    val labelCaps = TextStyle(
        fontFamily = fontFamily,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.05.em,
    )
}

val CoopMaterialTypography = Typography(
    displaySmall = CoopType.pageTitle,
    headlineMedium = CoopType.pageTitleMobile,
    headlineSmall = CoopType.sectionHeading,
    titleLarge = CoopType.pageTitleMobile,
    titleMedium = CoopType.titleMd,
    titleSmall = CoopType.bodyCompact.copy(fontWeight = FontWeight.SemiBold),
    bodyLarge = CoopType.bodyDefault,
    bodyMedium = CoopType.bodyCompact,
    bodySmall = CoopType.labelCaps.copy(fontWeight = FontWeight.Normal, letterSpacing = 0.sp),
    labelLarge = CoopType.bodyCompact.copy(fontWeight = FontWeight.SemiBold),
    labelMedium = CoopType.labelCaps,
    labelSmall = CoopType.labelCaps.copy(fontSize = 11.sp),
)
