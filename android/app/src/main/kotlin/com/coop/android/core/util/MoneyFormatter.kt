package com.coop.android.core.util

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.text.NumberFormat
import java.util.Currency
import java.util.Locale
import kotlin.math.abs

object CurrencyStore {
    private val _currency = MutableStateFlow("USD")
    val currency: StateFlow<String> = _currency.asStateFlow()

    fun current(): String = _currency.value

    fun set(code: String?) {
        val clean = code?.trim()?.uppercase()?.takeIf { it.length == 3 } ?: return
        _currency.value = clean
    }
}

object MoneyFormatter {
    fun format(amount: Double, currencyCode: String = CurrencyStore.current()): String {
        val code = currencyCode.trim().uppercase().ifBlank { "USD" }
        return try {
            val nf = NumberFormat.getCurrencyInstance(Locale.US)
            nf.currency = Currency.getInstance(code)
            nf.minimumFractionDigits = 2
            nf.maximumFractionDigits = 2
            nf.format(amount)
        } catch (_: IllegalArgumentException) {
            "$code ${String.format(Locale.US, "%.2f", amount)}"
        }
    }

    fun formatCompact(amount: Double, currencyCode: String = CurrencyStore.current()): String {
        val symbol = symbolFor(currencyCode)
        val absAmount = abs(amount)
        val sign = if (amount < 0) "-" else ""
        return when {
            absAmount >= 1_000_000.0 -> "${sign}${symbol}${String.format(Locale.US, "%.1fM", absAmount / 1_000_000.0)}"
            absAmount >= 1_000.0 -> "${sign}${symbol}${String.format(Locale.US, "%.1fk", absAmount / 1_000.0)}"
            else -> format(amount, currencyCode)
        }
    }

    fun symbolFor(currencyCode: String = CurrencyStore.current()): String {
        val code = currencyCode.trim().uppercase().ifBlank { "USD" }
        return try {
            Currency.getInstance(code).getSymbol(Locale.US)
        } catch (_: IllegalArgumentException) {
            "$code "
        }
    }
}
