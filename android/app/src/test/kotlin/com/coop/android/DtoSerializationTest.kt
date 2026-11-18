package com.coop.android

import com.coop.android.core.network.ApiClientFactory
import com.coop.android.core.network.dto.*
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DtoSerializationTest {

    private val json = ApiClientFactory.json

    @Test
    fun `decodes auth me billing ai and sync payloads accurately`() {
        val authRaw = """
            {"user_id":"usr_1","business_id":7,"business_name":"Kano Supply","currency":"NGN","role":"owner","email":"a@b.com"}
        """.trimIndent()
        val auth = json.decodeFromString(AuthMeDto.serializer(), authRaw)
        assertEquals(7, auth.businessId)
        assertEquals("NGN", auth.currency)

        val aiRaw = """
            {
              "type":"answer",
              "kind":"draft",
              "title":"Restock Draft",
              "message":"Drafting 5 units for Ada.",
              "basis":{"period":"30d","sources":["orders","products"]},
              "follow_ups":["Show stock levels"],
              "links":[{"label":"Orders","to":"/orders"}],
              "actions":[{"type":"DRAFT_ORDER","parameters":{"customer_id":1,"items":[{"product_id":2,"quantity":5}]}}],
              "credits_used":3
            }
        """.trimIndent()
        val ai = json.decodeFromString(AiChatResponseDto.serializer(), aiRaw)
        assertEquals("draft", ai.kind)
        assertEquals(1, ai.actions.size)
        assertEquals("DRAFT_ORDER", ai.actions.first().type)

        val billingRaw = """
            {
              "plan":"professional",
              "label":"Professional",
              "unlimited":false,
              "granted":1000,
              "used":40,
              "remaining":960,
              "base_plan":"free",
              "trial":{"available":false,"active":true,"used":true,"expired":false,"days":10,"days_remaining":7},
              "license":{"licensed":false,"active":false,"days_remaining":0,"expired":false}
            }
        """.trimIndent()
        val billing = json.decodeFromString(BillingSummaryDto.serializer(), billingRaw)
        assertEquals(960, billing.remaining)
        assertTrue(billing.trial.active)

        val pullRaw = """
            {"cursor":"2026-11-16T10:00:00","full_dump":true,"customers":[],"products":[],"orders":[],"order_items":[],"stock_movements":[]}
        """.trimIndent()
        val pull = json.decodeFromString(SyncPullResponseDto.serializer(), pullRaw)
        assertTrue(pull.fullDump)
        assertEquals("2026-11-16T10:00:00", pull.cursor)

        val investorRaw = """
            {
              "as_of":"2026-11-16",
              "window_days":28,
              "headline":"12 businesses, 50% activated",
              "businesses":{"total":12,"new_last_7_days":3,"new_previous_7_days":2,"signup_growth_pct_week_over_week":50.0},
              "activation":{"eligible_businesses":10,"activated":5,"rate_pct":50.0,"definition":"first invoice"},
              "engagement":{"active_last_7_days":6,"active_previous_7_days":4,"week_over_week_retention_pct":150.0,"definition":"active"},
              "revenue":{"currency":"USD","mrr":297.0,"previous_window_mrr":198.0,"mrr_growth_pct":50.0,"paying_businesses":3,"arpu":99.0,"definition":"paid"},
              "ai":{"credits_used":120,"requests":40,"credits_per_paying_business":40.0,"definition":"usage"}
            }
        """.trimIndent()
        val metrics = json.decodeFromString(PlatformInvestorMetricsDto.serializer(), investorRaw)
        assertEquals(12, metrics.businesses.total)
        assertEquals(297.0, metrics.revenue.mrr, 0.001)
    }
}
