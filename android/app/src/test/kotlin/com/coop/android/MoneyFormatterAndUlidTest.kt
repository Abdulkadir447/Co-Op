package com.coop.android

import com.coop.android.core.util.MoneyFormatter
import com.coop.android.core.util.UlidGenerator
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MoneyFormatterAndUlidTest {

    @Test
    fun `money formatter formats standard and compact values`() {
        val usd = MoneyFormatter.format(1250.5, "USD")
        assertTrue(usd.contains("1,250.50"))
        val compact = MoneyFormatter.formatCompact(15400.0, "USD")
        assertTrue(compact.contains("15.4k"))
    }

    @Test
    fun `ulid generator emits valid 26-char crockford base32 ids`() {
        val a = UlidGenerator.next()
        val b = UlidGenerator.next()
        assertEquals(26, a.length)
        assertEquals(26, b.length)
        assertNotEquals(a, b)
        assertTrue(a.all { it in "0123456789ABCDEFGHJKMNPQRSTVWXYZ" })
    }
}
