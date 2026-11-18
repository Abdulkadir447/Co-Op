package com.coop.android.core.offline

import kotlin.math.roundToLong

object LocalOrderMath {

    private val allowedTransitions: Map<String, List<String>> = mapOf(
        "pending" to listOf("confirmed", "cancelled"),
        "confirmed" to listOf("shipped", "cancelled"),
        "shipped" to listOf("delivered"),
        "delivered" to emptyList(),
        "cancelled" to emptyList(),
    )

    fun allowedNextStatuses(current: String): List<String> =
        allowedTransitions[current.lowercase()] ?: emptyList()

    fun canTransition(from: String, to: String): Boolean =
        to.lowercase() in allowedNextStatuses(from)

    data class OrderTotals(
        val subtotal: Double,
        val taxRate: Double?,
        val taxAmount: Double,
        val grandTotal: Double,
    )

    fun computeTotals(
        lineAmounts: List<Double>,
        taxEnabled: Boolean,
        taxRatePercent: Double,
    ): OrderTotals {
        val subtotal = round2(lineAmounts.sum())
        val rate = if (taxEnabled && taxRatePercent > 0.0) taxRatePercent else null
        val taxAmount = if (rate != null) round2(subtotal * (rate / 100.0)) else 0.0
        val grandTotal = round2(subtotal + taxAmount)
        return OrderTotals(
            subtotal = subtotal,
            taxRate = rate,
            taxAmount = taxAmount,
            grandTotal = grandTotal,
        )
    }

    fun round2(value: Double): Double = (value * 100.0).roundToLong() / 100.0
}
