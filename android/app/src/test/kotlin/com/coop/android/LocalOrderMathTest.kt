package com.coop.android

import com.coop.android.core.offline.LocalOrderMath
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LocalOrderMathTest {

    @Test
    fun `order status transitions follow backend state machine`() {
        assertTrue(LocalOrderMath.canTransition("pending", "confirmed"))
        assertTrue(LocalOrderMath.canTransition("pending", "cancelled"))
        assertFalse(LocalOrderMath.canTransition("pending", "delivered"))

        assertTrue(LocalOrderMath.canTransition("confirmed", "shipped"))
        assertTrue(LocalOrderMath.canTransition("confirmed", "cancelled"))
        assertFalse(LocalOrderMath.canTransition("confirmed", "delivered"))

        assertTrue(LocalOrderMath.canTransition("shipped", "delivered"))
        assertFalse(LocalOrderMath.canTransition("shipped", "cancelled"))

        assertTrue(LocalOrderMath.allowedNextStatuses("delivered").isEmpty())
        assertTrue(LocalOrderMath.allowedNextStatuses("cancelled").isEmpty())
        assertFalse(LocalOrderMath.canTransition("cancelled", "delivered"))
    }

    @Test
    fun `order totals compute tax snapshot when enabled`() {
        val withTax = LocalOrderMath.computeTotals(
            lineAmounts = listOf(100.0, 50.5),
            taxEnabled = true,
            taxRatePercent = 7.5,
        )
        assertEquals(150.5, withTax.subtotal, 0.001)
        assertEquals(7.5, withTax.taxRate!!, 0.001)
        assertEquals(11.29, withTax.taxAmount, 0.001)
        assertEquals(161.79, withTax.grandTotal, 0.001)

        val noTax = LocalOrderMath.computeTotals(
            lineAmounts = listOf(100.0),
            taxEnabled = false,
            taxRatePercent = 7.5,
        )
        assertNull(noTax.taxRate)
        assertEquals(0.0, noTax.taxAmount, 0.001)
        assertEquals(100.0, noTax.grandTotal, 0.001)
    }
}
