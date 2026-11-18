package com.coop.android.core.network.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class TeamInviteOutDto(
    val token: String,
    val email: String,
    val role: String,
    val status: String,
    @SerialName("business_name") val businessName: String = "",
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class AuthMeDto(
    @SerialName("user_id") val userId: String,
    @SerialName("business_id") val businessId: Int? = null,
    @SerialName("business_name") val businessName: String = "",
    val currency: String = "USD",
    val role: String = "owner",
    val email: String? = null,
    @SerialName("pending_invitation") val pendingInvitation: TeamInviteOutDto? = null,
)

@Serializable
data class TeamMemberOutDto(
    @SerialName("user_id") val userId: String,
    val email: String? = null,
    val role: String,
    @SerialName("joined_at") val joinedAt: String? = null,
)

@Serializable
data class TeamResponseDto(
    val members: List<TeamMemberOutDto> = emptyList(),
    val invitations: List<TeamInviteOutDto> = emptyList(),
)

@Serializable
data class TeamInviteCreateDto(
    val email: String,
    val role: String,
)

@Serializable
data class TeamInviteAcceptDto(
    val token: String,
)

@Serializable
data class TeamRoleUpdateDto(
    val role: String,
)

@Serializable
data class BusinessSettingsOutDto(
    val name: String,
    val industry: String? = null,
    val currency: String = "USD",
    @SerialName("owner_email") val ownerEmail: String? = null,
    val address: String? = null,
    val phone: String? = null,
    @SerialName("tax_id") val taxId: String? = null,
    @SerialName("registration_number") val registrationNumber: String? = null,
    val website: String? = null,
    val timezone: String? = null,
    @SerialName("logo_url") val logoUrl: String? = null,
    @SerialName("ai_response_style") val aiResponseStyle: String = "standard",
    @SerialName("tax_enabled") val taxEnabled: Boolean = false,
    @SerialName("tax_rate") val taxRate: Double = 0.0,
    @SerialName("tax_label") val taxLabel: String = "Tax",
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
)

@Serializable
data class BusinessSettingsUpdateDto(
    val name: String? = null,
    val industry: String? = null,
    val currency: String? = null,
    @SerialName("owner_email") val ownerEmail: String? = null,
    val address: String? = null,
    val phone: String? = null,
    @SerialName("tax_id") val taxId: String? = null,
    @SerialName("registration_number") val registrationNumber: String? = null,
    val website: String? = null,
    val timezone: String? = null,
    @SerialName("ai_response_style") val aiResponseStyle: String? = null,
    @SerialName("tax_enabled") val taxEnabled: Boolean? = null,
    @SerialName("tax_rate") val taxRate: Double? = null,
    @SerialName("tax_label") val taxLabel: String? = null,
)

@Serializable
data class AuditEntryOutDto(
    val id: Int,
    @SerialName("table_name") val tableName: String,
    @SerialName("record_id") val recordId: Int? = null,
    val action: String,
    val actor: String? = null,
    val change: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
)
