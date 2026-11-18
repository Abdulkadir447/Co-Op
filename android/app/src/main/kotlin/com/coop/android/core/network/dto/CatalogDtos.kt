package com.coop.android.core.network.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class ProductOutDto(
    val id: Int,
    val sku: String,
    val name: String,
    val description: String? = null,
    val category: String? = null,
    @SerialName("unit_price") val unitPrice: Double,
    @SerialName("cost_price") val costPrice: Double? = null,
    @SerialName("current_stock") val currentStock: Int = 0,
    @SerialName("reorder_level") val reorderLevel: Int = 5,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
    val version: Int = 1,
)

@Serializable
data class ProductListResponseDto(
    val items: List<ProductOutDto> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val limit: Int = 20,
)

@Serializable
data class ProductCreateDto(
    val sku: String,
    val name: String,
    val description: String? = null,
    val category: String? = null,
    @SerialName("unit_price") val unitPrice: Double,
    @SerialName("cost_price") val costPrice: Double? = null,
    @SerialName("current_stock") val currentStock: Int = 0,
    @SerialName("reorder_level") val reorderLevel: Int = 5,
)

@Serializable
data class ProductUpdateDto(
    val name: String? = null,
    val description: String? = null,
    val category: String? = null,
    @SerialName("unit_price") val unitPrice: Double? = null,
    @SerialName("cost_price") val costPrice: Double? = null,
    @SerialName("reorder_level") val reorderLevel: Int? = null,
)

@Serializable
data class AdjustStockRequestDto(
    val change: Int,
    val reason: String,
    val note: String? = null,
)

@Serializable
data class StockMovementOutDto(
    val id: Int,
    @SerialName("product_id") val productId: Int,
    val change: Int,
    val reason: String,
    val note: String? = null,
    @SerialName("order_id") val orderId: Int? = null,
    val actor: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
)

@Serializable
data class MovementListResponseDto(
    val items: List<StockMovementOutDto> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val limit: Int = 20,
)

@Serializable
data class InventorySummaryDto(
    @SerialName("products_count") val productsCount: Int = 0,
    @SerialName("inventory_value") val inventoryValue: Double = 0.0,
    @SerialName("low_stock_count") val lowStockCount: Int = 0,
    @SerialName("out_of_stock_count") val outOfStockCount: Int = 0,
    @SerialName("categories_count") val categoriesCount: Int = 0,
)

@Serializable
data class CustomerOutDto(
    val id: Int,
    @SerialName("full_name") val fullName: String,
    val email: String,
    val phone: String? = null,
    val address: String? = null,
    val company: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
)

@Serializable
data class CustomerListResponseDto(
    val items: List<CustomerOutDto> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val limit: Int = 20,
)

@Serializable
data class CustomerCreateDto(
    @SerialName("full_name") val fullName: String,
    val email: String,
    val phone: String? = null,
    val address: String? = null,
    val company: String? = null,
)

@Serializable
data class CustomerUpdateDto(
    @SerialName("full_name") val fullName: String? = null,
    val email: String? = null,
    val phone: String? = null,
    val address: String? = null,
    val company: String? = null,
)

@Serializable
data class CustomerBriefDto(
    @SerialName("full_name") val fullName: String,
)

@Serializable
data class OrderItemCreateDto(
    @SerialName("product_id") val productId: Int,
    val quantity: Int,
    @SerialName("unit_price") val unitPrice: Double,
)

@Serializable
data class OrderItemOutDto(
    val id: Int,
    @SerialName("product_id") val productId: Int,
    val quantity: Int,
    @SerialName("unit_price") val unitPrice: Double,
    @SerialName("total_price") val totalPrice: Double,
    @SerialName("product_name") val productName: String? = null,
)

@Serializable
data class OrderCreateDto(
    @SerialName("customer_id") val customerId: Int,
    val status: String = "pending",
    val items: List<OrderItemCreateDto>,
)

@Serializable
data class OrderStatusUpdateDto(
    val status: String,
)

@Serializable
data class OrderOutDto(
    val id: Int,
    @SerialName("customer_id") val customerId: Int,
    val customer: CustomerBriefDto? = null,
    val status: String,
    @SerialName("allowed_transitions") val allowedTransitions: List<String> = emptyList(),
    @SerialName("total_amount") val totalAmount: Double,
    @SerialName("tax_rate") val taxRate: Double? = null,
    @SerialName("tax_amount") val taxAmount: Double = 0.0,
    @SerialName("grand_total") val grandTotal: Double = 0.0,
    @SerialName("amount_paid") val amountPaid: Double = 0.0,
    @SerialName("balance_due") val balanceDue: Double = 0.0,
    @SerialName("payment_status") val paymentStatus: String = "unpaid",
    @SerialName("order_date") val orderDate: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    val items: List<OrderItemOutDto> = emptyList(),
    @SerialName("invoice_number") val invoiceNumber: String? = null,
)

@Serializable
data class OrderListResponseDto(
    val items: List<OrderOutDto> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val limit: Int = 20,
)

@Serializable
data class OrderPaymentCreateDto(
    val amount: Double,
    val method: String = "cash",
    val reference: String? = null,
    val note: String? = null,
)

@Serializable
data class OrderPaymentOutDto(
    val id: Int,
    @SerialName("order_id") val orderId: Int,
    val amount: Double,
    val method: String,
    val reference: String? = null,
    val note: String? = null,
    @SerialName("received_at") val receivedAt: String? = null,
    @SerialName("created_by") val createdBy: String? = null,
)

@Serializable
data class OrderPaymentsResponseDto(
    @SerialName("order_id") val orderId: Int,
    val items: List<OrderPaymentOutDto> = emptyList(),
    @SerialName("amount_paid") val amountPaid: Double = 0.0,
    @SerialName("balance_due") val balanceDue: Double = 0.0,
    @SerialName("payment_status") val paymentStatus: String = "unpaid",
)

@Serializable
data class ReceivableRowDto(
    @SerialName("order_id") val orderId: Int,
    @SerialName("customer_id") val customerId: Int,
    @SerialName("customer_name") val customerName: String? = null,
    @SerialName("order_date") val orderDate: String? = null,
    val status: String,
    val subtotal: Double,
    @SerialName("tax_amount") val taxAmount: Double,
    val total: Double,
    @SerialName("amount_paid") val amountPaid: Double,
    @SerialName("balance_due") val balanceDue: Double,
    @SerialName("payment_status") val paymentStatus: String,
    @SerialName("age_days") val ageDays: Int = 0,
)

@Serializable
data class ReceivablesResponseDto(
    val items: List<ReceivableRowDto> = emptyList(),
    @SerialName("total_outstanding") val totalOutstanding: Double = 0.0,
    @SerialName("total_collected") val totalCollected: Double = 0.0,
    val count: Int = 0,
    val page: Int = 1,
    val limit: Int = 20,
)

@Serializable
data class InvoiceCreateRequestDto(
    @SerialName("order_id") val orderId: Int,
    @SerialName("issue_date") val issueDate: String? = null,
    @SerialName("due_date") val dueDate: String? = null,
    val notes: String? = null,
)

@Serializable
data class InvoiceUpdateRequestDto(
    @SerialName("issue_date") val issueDate: String? = null,
    @SerialName("due_date") val dueDate: String? = null,
    val notes: String? = null,
    val status: String? = null,
)

@Serializable
data class InvoiceSummaryDto(
    val id: Int,
    val number: String,
    @SerialName("order_id") val orderId: Int,
    @SerialName("customer_id") val customerId: Int? = null,
    @SerialName("customer_name") val customerName: String? = null,
    @SerialName("customer_email") val customerEmail: String? = null,
    val status: String,
    @SerialName("issue_date") val issueDate: String? = null,
    @SerialName("due_date") val dueDate: String? = null,
    val notes: String? = null,
    @SerialName("total_amount") val totalAmount: Double = 0.0,
    @SerialName("tax_amount") val taxAmount: Double = 0.0,
    @SerialName("grand_total") val grandTotal: Double = 0.0,
    @SerialName("amount_paid") val amountPaid: Double = 0.0,
    @SerialName("balance_due") val balanceDue: Double = 0.0,
    @SerialName("payment_status") val paymentStatus: String = "unpaid",
)

@Serializable
data class InvoiceListResponseDto(
    val items: List<InvoiceSummaryDto> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val limit: Int = 20,
)

@Serializable
data class InvoiceDetailDto(
    val id: Int,
    val number: String,
    @SerialName("order_id") val orderId: Int,
    val status: String,
    @SerialName("issue_date") val issueDate: String? = null,
    @SerialName("due_date") val dueDate: String? = null,
    val notes: String? = null,
    val order: OrderOutDto? = null,
    val customer: CustomerOutDto? = null,
)
