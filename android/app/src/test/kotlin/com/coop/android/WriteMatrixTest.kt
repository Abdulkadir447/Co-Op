package com.coop.android

import com.coop.android.core.auth.WriteMatrix
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WriteMatrixTest {

    @Test
    fun `owner can write everywhere and manager cannot write owner-only surfaces`() {
        assertTrue(WriteMatrix.canWrite("owner", "/billing/plan"))
        assertTrue(WriteMatrix.canWrite("owner", "/business/settings"))
        assertTrue(WriteMatrix.canWrite("owner", "/team/invites"))

        assertTrue(WriteMatrix.canWrite("manager", "/orders"))
        assertTrue(WriteMatrix.canWrite("manager", "/products"))
        assertTrue(WriteMatrix.canWrite("manager", "/sync/push"))
        assertFalse(WriteMatrix.canWrite("manager", "/billing/plan"))
        assertFalse(WriteMatrix.canWrite("manager", "/team/invites"))
        assertFalse(WriteMatrix.canWrite("manager", "/business/settings"))
    }

    @Test
    fun `sales inventory accountant and viewer roles respect WRITE_MATRIX`() {
        assertTrue(WriteMatrix.canWrite("sales", "/customers"))
        assertTrue(WriteMatrix.canWrite("sales", "/orders"))
        assertTrue(WriteMatrix.canWrite("sales", "/invoices"))
        assertFalse(WriteMatrix.canWrite("sales", "/products"))

        assertTrue(WriteMatrix.canWrite("inventory", "/products"))
        assertTrue(WriteMatrix.canWrite("inventory", "/inventory"))
        assertFalse(WriteMatrix.canWrite("inventory", "/orders"))

        assertTrue(WriteMatrix.canWrite("accountant", "/invoices"))
        assertFalse(WriteMatrix.canWrite("accountant", "/orders"))

        assertFalse(WriteMatrix.canWrite("viewer", "/orders"))
        assertFalse(WriteMatrix.canWrite("viewer", "/products"))
        assertFalse(WriteMatrix.canWrite("viewer", "/customers"))
    }
}
