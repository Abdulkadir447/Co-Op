package com.coop.android.core.network

import com.coop.android.BuildConfig
import com.coop.android.core.auth.SessionManager
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.TimeUnit

object ApiClientFactory {

    val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        explicitNulls = false
        isLenient = true
    }

    fun create(sessionManager: SessionManager): CoopApiService {
        val dynamicHostInterceptor = Interceptor { chain ->
            val original = chain.request()
            val configuredBase = sessionManager.getServerUrl().toHttpUrlOrNull()
            val updatedRequest = if (configuredBase != null) {
                val newUrl = original.url.newBuilder()
                    .scheme(configuredBase.scheme)
                    .host(configuredBase.host)
                    .port(configuredBase.port)
                    .build()
                original.newBuilder().url(newUrl).build()
            } else {
                original
            }
            chain.proceed(updatedRequest)
        }

        val authInterceptor = Interceptor { chain ->
            val token = sessionManager.getToken()
            val reqBuilder = chain.request().newBuilder()
                .header("Accept", "application/json")
            if (!token.isNullOrBlank()) {
                reqBuilder.header("Authorization", "Bearer $token")
            }
            val response = chain.proceed(reqBuilder.build())
            if (response.code == 401 && !token.isNullOrBlank()) {
                sessionManager.notifyUnauthorized()
            }
            response
        }

        val logging = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BASIC
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
            redactHeader("Authorization")
        }

        val okHttp = OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(45, TimeUnit.SECONDS)
            .writeTimeout(45, TimeUnit.SECONDS)
            .addInterceptor(dynamicHostInterceptor)
            .addInterceptor(authInterceptor)
            .addInterceptor(logging)
            .build()

        val placeholderBaseUrl = "https://api.coop.app/"
        return Retrofit.Builder()
            .baseUrl(placeholderBaseUrl)
            .client(okHttp)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(CoopApiService::class.java)
    }
}
