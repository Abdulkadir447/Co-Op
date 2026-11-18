package com.coop.android.core.network

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import retrofit2.HttpException

object ApiErrorParser {
    fun message(t: Throwable, fallback: String = "Request failed"): String {
        if (t is HttpException) {
            val raw = runCatching { t.response()?.errorBody()?.string() }.getOrNull()
            if (!raw.isNullOrBlank()) {
                runCatching {
                    val obj = ApiClientFactory.json.parseToJsonElement(raw).jsonObject
                    val detail = obj["detail"]
                    when (detail) {
                        is JsonPrimitive -> return detail.content
                        is JsonObject -> {
                            val msg = detail["message"]?.jsonPrimitive?.content
                            if (!msg.isNullOrBlank()) return msg
                        }
                        else -> Unit
                    }
                    val msg = obj["message"]?.jsonPrimitive?.content
                    if (!msg.isNullOrBlank()) return msg
                }
            }
            return when (t.code()) {
                401 -> "Your session has expired. Please sign in again."
                402 -> "AI credits exhausted or payment required."
                403 -> "Your role does not allow this action."
                404 -> "Record not found."
                409 -> "Conflict with current state."
                422 -> "Please check the entered values."
                429 -> "Rate limit reached. Please try again shortly."
                503 -> "Service is temporarily unavailable."
                else -> "Server error (${t.code()})"
            }
        }
        return t.message?.takeIf { it.isNotBlank() } ?: fallback
    }
}
