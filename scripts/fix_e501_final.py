#!/usr/bin/env python3
"""Final consolidated E501 fix pass — line numbers matched to the restored
backend tree. Reverse-order application + per-file compile gate."""

import ast
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXES = []


def fix(path, lineno, *new_lines, consume=1):
    FIXES.append((path, lineno, list(new_lines), consume))


# ---- backend/ai/actions.py ----
fix("backend/ai/actions.py", 39,
    '        "description": (',
    '            "Prepare an order the owner reviews; executes via the existing "',
    '            "Create Order flow."',
    '        ),')
fix("backend/ai/actions.py", 49,
    '        label = getattr(link, "label", None) or (',
    '            link.get("label") if isinstance(link, dict) else None',
    '        )')
fix("backend/ai/actions.py", 89,
    '        return (',
    '            None,',
    '            f"multiple customers match {customer_name!r} — the owner should "',
    '            "choose manually",',
    '        )')
fix("backend/ai/actions.py", 117,
    '        unit_price = (',
    '            float(unit_price)',
    '            if unit_price is not None and float(unit_price) > 0',
    '            else (product.unit_price or 0)',
    '        )')
fix("backend/ai/actions.py", 148,
    '        atype = getattr(action, "type", None) or (',
    '            action.get("type") if isinstance(action, dict) else None',
    '        )')
fix("backend/ai/actions.py", 149,
    '        raw = getattr(action, "parameters", None) or (',
    '            action.get("parameters") if isinstance(action, dict) else None',
    '        ) or {}')

# ---- backend/ai/context.py ----
fix("backend/ai/context.py", 29,
    'async def build_context(',
    '    db, business_id: int, business_name: str = "", currency: str = "USD"',
    ') -> dict[str, Any]:')
fix("backend/ai/context.py", 33,
    '    first_next = (',
    '        _dt.date(today.year + 1, 1, 1)',
    '        if today.month == 12',
    '        else _dt.date(today.year, today.month + 1, 1)',
    '    )')
fix("backend/ai/context.py", 34,
    '    first_last = (',
    '        _dt.date(today.year, today.month - 1, 1)',
    '        if today.month > 1',
    '        else _dt.date(today.year - 1, 12, 1)',
    '    )')
fix("backend/ai/context.py", 38,
    '    order_scope = [',
    '        Order.business_id == bid,',
    '        Order.deleted_at.is_(None),',
    '        Order.status != "cancelled",',
    '    ]')
fix("backend/ai/context.py", 126,
    '            func.coalesce(',
    '                func.sum(',
    '                    (OrderItem.unit_price - func.coalesce(Product.cost_price, 0.0))',
    '                    * OrderItem.quantity',
    '                ),',
    '                0.0,',
    '            ),')
fix("backend/ai/context.py", 177,
    '                {',
    '                    "name": p.name,',
    '                    "sku": p.sku,',
    '                    "stock": p.current_stock,',
    '                    "reorder_level": p.reorder_level,',
    '                }')

# ---- backend/ai/forecast.py ----
fix("backend/ai/forecast.py", 176,
    '        "method": (',
    '            "Least-squares trend over your completed months — a transparent "',
    '            "calculation, not a machine-learning prediction."',
    '        ),')

# ---- backend/ai/prompts.py ----
fix("backend/ai/prompts.py", 45,
    '1. Every number, name, date, percentage and product you mention MUST exist in the',
    'verified context. If the context does not contain something, say plainly that you',
    "don't have that data. Never invent, round into existence, or extrapolate numbers.")
fix("backend/ai/prompts.py", 46,
    '2. Forecasting: the context contains measured changes only. You may describe the',
    'measured trend and what it implies, and you may label such an explanation as a',
    'forecast — but you must not invent future figures.')
fix("backend/ai/prompts.py", 47,
    '3. You NEVER execute anything. You may only PROPOSE actions (orders to draft) in',
    'the "actions" field, and only when the user asked you to prepare one.')
fix("backend/ai/prompts.py", 49,
    '5. Be concise and owner-level: 2-5 short sections or bullets. No filler, no generic',
    'advice not tied to their data, no disclaimers beyond what you lack.')
fix("backend/ai/prompts.py", 50,
    '6. Prefer their verified_insights when answering "what should I worry about / what',
    'matters" questions — they are already checked; explain and prioritise them.')
fix("backend/ai/prompts.py", 52,
    '8. When the context contains a "report" block (the report the owner is looking at),',
    'it is your primary subject: explain what changed versus the comparison period, what',
    "matters most, and what to investigate. Use ONLY that report's numbers.")
fix("backend/ai/prompts.py", 65,
    'KIND GUIDANCE: "fact" = read straight from context; "calculation" = derived (totals,',
    'shares, recency); "forecast" = trend-based, clearly an estimate; "suggestion" = a',
    'recommendation; "draft" = you prepared an order draft in actions; "clarify" = you',
    'cannot ground an answer (say what data would help).')
fix("backend/ai/prompts.py", 70,
    '- DRAFT_ORDER: prepare an order the owner will review. parameters: {"customer_name":',
    'string, "customer_email": string or null, "product_name": string or null,',
    '"product_sku": string or null, "quantity": integer >= 1, "unit_price": number or',
    'null}. Propose it ONLY when the user asks to draft/prepare an order or a follow-up',
    'for a specific customer. Copy customer/product names EXACTLY as they appear in the',
    'context (customers.inactive_30d_plus, recent_orders) so they can be matched. If you',
    "don't know a product the customer bought, set product_name to null.")
fix("backend/ai/prompts.py", 93,
    'def user_prompt(',
    '    question: str, context_json: str, history: list[dict[str, str]]',
    ') -> list[dict[str, str]]:')

# ---- backend/ai/service.py ----
fix("backend/ai/service.py", 226,
    '        message += (',
    '            f"\\n\\n(Note: I couldn\'t prepare the requested {r[\'type\'].lower()} — "',
    '            f"{r[\'reason\']}.)"',
    '        )')

# ---- backend/ai/usage.py ----
fix("backend/ai/usage.py", 39,
    '        return self.credits_per_request + math.ceil(',
    '            extra / 1000 * self.credits_per_1k_output_tokens',
    '        )')

# ---- backend/alembic/versions/0007_ai_history.py ----
fix("backend/alembic/versions/0007_ai_history.py", 41,
    '        "CREATE INDEX IF NOT EXISTS idx_ai_history_business_created ON "',
    '        "ai_history (business_id, created_at)"')

# ---- backend/backups.py ----
fix("backend/backups.py", 258,
    '                    f"Backup order references customer id {old_customer} "',
    '                    "which is not in the backup."')

# ---- backend/billing.py ----
fix("backend/billing.py", 228,
    'async def change_plan(',
    '    db, business: Business, plan: str, actor: Optional[str] = None',
    ') -> Subscription:')

# ---- backend/briefing.py ----
fix("backend/briefing.py", 196,
    '            cust_units[o.customer_id][it.product_id] = (',
    '                cust_units[o.customer_id].get(it.product_id, 0) + it.quantity',
    '            )')
fix("backend/briefing.py", 234,
    '    out = sorted(',
    '        (p for p in products if (p.current_stock or 0) <= 0),',
    '        key=lambda p: -prod_units.get(p.id, 0),',
    '    )[:5]')
fix("backend/briefing.py", 251,
    '            else (',
    '                f"Your catalog is loaded: {total_products} products and "',
    '                f"{total_customers} customers"',
    '            )')
fix("backend/briefing.py", 255,
    '                f"Based on your imported history — {span_months} "',
    '                f"month{\'s\' if span_months != 1 else \'\'} of data "')
fix("backend/briefing.py", 256,
    '                f"({first_day.isoformat() if first_day else \'—\'} to "',
    '                f"{last_day.isoformat() if last_day else \'—\'}). "')
fix("backend/briefing.py", 257,
    '                "Everything below is computed from that history; live activity "',
    '                "you add in Co-op joins it from today."')
fix("backend/briefing.py", 276,
    '                f"{_money(rev_this)} so far this month "',
    '                f"({month_orders.get(cur_month, 0)} orders) vs "')
fix("backend/briefing.py", 312,
    '                body=(',
    '                    "Your revenue is concentrated in a few products. If one of "',
    '                    "them runs out or demand shifts, a large share of your "',
    '                    "sales is exposed."',
    '                ),')
fix("backend/briefing.py", 321,
    '        for pid, u in sorted(',
    '            cust_units.get(target["customer_id"], {}).items(), key=lambda kv: -kv[1]',
    '        ):')
fix("backend/briefing.py", 333,
    '                (',
    '                    f"They were worth {_money(target[\'lifetime\'])} in lifetime orders. "',
    '                    if target["lifetime"]',
    '                    else ""',
    '                )',
    '                + f"{len(inactive)} customer{\'s\' if len(inactive) != 1 else \'\'} in your history "',
    '                + "have gone quiet for 30+ days — a check-in now is the cheapest growth you have."',
    consume=2)
fix("backend/briefing.py", 336,
    '            evidence=(',
    '                f"last order {target[\'days_since\']} days ago · "',
    '                f"{len(inactive)} inactive customers total"',
    '            ),')
fix("backend/briefing.py", 365,
    '            title=(',
    '                f"{len(inactive_top)} customer{\'s\' if len(inactive_top) != 1 else \'\'} "',
    '                "haven\'t ordered in 30+ days"',
    '            ),')
fix("backend/briefing.py", 367,
    '            evidence=(',
    '                f"most recent: {inactive_top[0][\'name\']} "',
    '                f"({inactive_top[0][\'days_since\']} days)"',
    '            ),')
fix("backend/briefing.py", 380,
    '                else (',
    '                    f"{out_count} product{\'s\' if out_count != 1 else \'\'} out of stock"',
    '                    if out_count')
fix("backend/briefing.py", 381,
    '                    else f"{low_count} product{\'s\' if low_count != 1 else \'\'} "',
    '                    "at or below reorder level"',
    '                )')
fix("backend/briefing.py", 383,
    '            body=(',
    '                "These items can no longer be sold (or soon won\'t). Restock the "',
    '                "top sellers first."',
    '            ),')
fix("backend/briefing.py", 399,
    '                + (',
    '                    ""',
    '                    if blended_margin >= 25',
    '                    else "Margins under 25% leave little room for discounts "',
    '                    "or errors."',
    '                )')
fix("backend/briefing.py", 401,
    '            evidence=(',
    '                f"profit {_money(margin_total)} on {_money(margin_revenue)} "',
    '                "margin-relevant revenue"',
    '            ),')

# ---- backend/exports/renderers.py ----
fix("backend/exports/renderers.py", 166,
    '{INDENT}fontSize=12,',
    '{INDENT}textColor=colors.HexColor("#5b5fef"),')
fix("backend/exports/renderers.py", 203,
    '    if (',
    '        report.chart.kind in ("line", "bar")',
    '        and report.chart.series',
    '        and report.chart.labels',
    '        and report.chart.series[0]["data"]',
    '    ):')

# ---- backend/exports/service.py ----
fix("backend/exports/service.py", 24,
    '    safe_title = (',
    '        "".join(c if c.isalnum() or c in " -" else "" for c in report.title)',
    '        .strip()',
    '        .replace(" ", "_")',
    '        or "report"',
    '    )')
fix("backend/exports/service.py", 30,
    '        return (',
    '            render_xlsx(report),',
    '            f"{base}.xlsx",',
    '            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",',
    '        )')

# ---- backend/importer.py ----
fix("backend/importer.py", 129,
    '{INDENT}"price_usd",',
    '{INDENT}"retail_price",',
    '{INDENT}"mrp",',
    '{INDENT}"price_each",',
    '{INDENT}), _parse_money, "money"),')
fix("backend/importer.py", 139,
    '{INDENT}"reorder_qty",',
    '{INDENT}"reorder",',
    '{INDENT}"threshold",',
    '{INDENT}"min_level",',
    '{INDENT}), _parse_int, "int"),')
fix("backend/importer.py", 184,
    '{INDENT}"customer_email_address",',
    '{INDENT}"email_address",',
    '{INDENT}), _optional, "email"),')
fix("backend/importer.py", 240,
    '            return ParsedFile(',
    '                filename,',
    '                "unknown",',
    '                [],',
    '                [],',
    '                error="Unsupported file type. Use .csv or .xlsx.",',
    '            )')
fix("backend/importer.py", 335,
    '    return (',
    '        2 <= len(s) <= 60',
    '        and not EMAIL_RE.match(s)',
    '        and not _is_money(s)',
    '        and re.search(r"[A-Za-z]", s)',
    '    )')
fix("backend/importer.py", 522,
    '            elif (',
    '                spec.kind == "money"',
    '                and _looks_like(vals, _is_money, 0.6)',
    '                and _looks_like(vals, _is_intish, 0.0)',
    '            ):')
fix("backend/importer.py", 551,
    '            result.append(',
    '                SuggestedMapping(',
    '                    h, None, 0.0, "Review", ["no confident match — pick a target or ignore"]',
    '                )',
    '            )')
fix("backend/importer.py", 638,
    '        field = (',
    '            "name"',
    '            if "empty value" in str(e) and not _cell(row, field_col, "name").strip()',
    '            else "unit_price"',
    '        )')
fix("backend/importer.py", 647,
    '    for fkey, parse in (',
    '        ("cost_price", _parse_money),',
    '        ("current_stock", _parse_int),',
    '        ("reorder_level", _parse_int),',
    '    ):')
fix("backend/importer.py", 741,
    '            key = (',
    '                err.split(":")[0]',
    '                .replace("missing/invalid", "missing")',
    '                .replace("invalid", "invalid")',
    '            )')
fix("backend/importer.py", 755,
    '{INDENT}Product.deleted_at.is_(None),',
    '{INDENT}Product.sku.is_not(None),',
    '{INDENT})',
    '{INDENT})',
    '{INDENT}).all()')
fix("backend/importer.py", 769,
    '            if (rec["sku"] and rec["sku"].lower() in existing_skus) or (',
    '                not rec["sku"] and rec["name"].lower() in existing_names',
    '            ):')
fix("backend/importer.py", 931,
    '                Product.business_id == business_id,',
    '                Product.deleted_at.is_(None),',
    '                Product.sku.is_not(None),',
    '            )',
    '        )).all()')
fix("backend/importer.py", 949,
    '            if (rec["sku"] and rec["sku"].lower() in existing_skus) or (',
    '                not rec["sku"] and rec["name"].lower() in existing_names',
    '            ):')
fix("backend/importer.py", 1068,
    '                row_error(',
    '                    row_no,',
    '                    f"customer email {rec[\'cust_email\']!r} not found — import customers "',
    '                    "first or map the name only",',
    '                )')
fix("backend/importer.py", 1072,
    '                row_error(',
    '                    row_no,',
    '                    f"multiple customers are named {rec[\'cust_name\']!r} — add an email or "',
    '                    "phone column to disambiguate",',
    '                )')
fix("backend/importer.py", 1076,
    '                row_error(',
    '                    row_no,',
    '                    "multiple customers share this phone number — add an email column "',
    '                    "to disambiguate",',
    '                )')
fix("backend/importer.py", 1100,
    '                    row_error(',
    '                        row_no,',
    '                        f"multiple products are named {rec[\'prod_name\']!r} — map a SKU "',
    '                        "column to disambiguate",',
    '                    )')
fix("backend/importer.py", 1105,
    '                    row_error(',
    '                        row_no,',
    '                        "unknown product with no price to create from — import products "',
    '                        "first or map a price",',
    '                    )')
fix("backend/importer.py", 1112,
    '                        sku=(',
    '                            rec["prod_sku"]',
    '                            or f"IMP-{_slug(rec[\'prod_name\'])[:24] or \'item\'}-{gen_prod_n:03d}"',
    '                        ),')
fix("backend/importer.py", 1121,
    '                row_error(',
    '                    row_no,',
    '                    "no selling price available — map a price column or import the "',
    '                    "product first",',
    '                )')
fix("backend/importer.py", 1125,
    '                     (',
    '                         rec["prod_sku"].lower() or rec["prod_name"].lower(),',
    '                         rec["qty"],',
    '                         round(price, 2),',
    '                     ))')
fix("backend/importer.py", 1157,
    '            warnings.append(',
    '                f"{ref_skipped} rows already exist under the same order reference "',
    '                "and were skipped."',
    '            )')
fix("backend/importer.py", 1159,
    '            warnings.append(',
    '                f"{ambiguous_name_rows} rows skipped — multiple customers share a "',
    '                "name; add an email or phone column to disambiguate."',
    '            )')
fix("backend/importer.py", 1161,
    '            warnings.append(',
    '                f"{ambiguous_phone_rows} rows skipped — multiple customers share a "',
    '                "phone number; add an email column to disambiguate."',
    '            )')
fix("backend/importer.py", 1163,
    '            warnings.append(',
    '                f"{gen_cust_n} customers had no email column — placeholder emails "',
    '                "were generated."',
    '            )')
fix("backend/importer.py", 1165,
    '            warnings.append(',
    '                f"{gen_prod_n} products were created from order rows (price taken "',
    '                "from the sale where available)."',
    '            )')
fix("backend/importer.py", 1167,
    '            warnings.append(',
    '                "Imported sales were recorded as delivered history; current stock "',
    '                "was NOT decremented."',
    '            )')

# ---- backend/main.py ----
fix("backend/main.py", 498,
    '    low_stock: bool = Query(',
    '        False, description="Only products in stock but at/below their reorder level"',
    '    ),')
fix("backend/main.py", 544,
    '    stmt = select(Product).where(',
    '        Product.id == id, Product.business_id == business.id, Product.deleted_at.is_(None)',
    '    )')
fix("backend/main.py", 648,
    '            func.coalesce(',
    '                func.sum(',
    '                    Product.current_stock * func.coalesce(Product.cost_price, Product.unit_price)',
    '                ),',
    '                0.0,',
    '            ),')
fix("backend/main.py", 654,
    '        select(func.count(func.distinct(Product.category))).where(',
    '            *scope, Product.category.is_not(None)',
    '        )')
fix("backend/main.py", 716,
    '    base = select(Customer).where(',
    '        Customer.business_id == business.id, Customer.deleted_at.is_(None)',
    '    )')
fix("backend/main.py", 720,
    '            or_(',
    '                Customer.full_name.ilike(like),',
    '                Customer.email.ilike(like),',
    '                Customer.company.ilike(like),',
    '            )')
fix("backend/main.py", 737,
    '    stmt = select(Customer).where(',
    '        Customer.id == id, Customer.business_id == business.id, Customer.deleted_at.is_(None)',
    '    )')
fix("backend/main.py", 983,
    '        .options(',
    '            selectinload(Order.customer),',
    '            selectinload(Order.items).selectinload(OrderItem.product),',
    '        )')
fix("backend/main.py", 1000,
    '    total = (',
    '        await db.execute(select(func.count()).select_from(base.order_by(None).subquery()))',
    '    ).scalar() or 0')
fix("backend/main.py", 1096,
    '    first_last = (',
    '        date(today.year, today.month - 1, 1)',
    '        if today.month > 1',
    '        else date(today.year - 1, 12, 1)',
    '    )')
fix("backend/main.py", 1104,
    '        .where(',
    '            *order_scope,',
    '            Order.status == "delivered",',
    '            Order.order_date >= datetime.combine(today, time.min),',
    '        )')
fix("backend/main.py", 1127,
    '            func.sum(',
    '                (OrderItem.unit_price - func.coalesce(Product.cost_price, 0.0))',
    '                * OrderItem.quantity',
    '            ),')
fix("backend/main.py", 1142,
    '            func.coalesce(',
    '                func.sum(',
    '                    Product.current_stock * func.coalesce(Product.cost_price, Product.unit_price)',
    '                ),',
    '                0.0,',
    '            ),')
fix("backend/main.py", 1150,
    '        select(func.count(Customer.id)).where(',
    '            Customer.business_id == bid, Customer.deleted_at.is_(None)',
    '        )')
fix("backend/main.py", 1255,
    '    first_last = (',
    '        date(today.year, today.month - 1, 1)',
    '        if today.month > 1',
    '        else date(today.year - 1, 12, 1)',
    '    )')
fix("backend/main.py", 1256,
    '    scope = [',
    '        Order.business_id == business.id,',
    '        Order.deleted_at.is_(None),',
    '        Order.status.in_(_ACTIVE_STATUSES),',
    '    ]')
fix("backend/main.py", 1272,
    '    return GrowthResponse(',
    '        this_month_revenue=this_rev, last_month_revenue=last_rev, growth_percent=growth',
    '    )')
fix("backend/main.py", 1463,
    '        ImportRunRequest(entity=entity, mapping=mapping_dict),',
    '        data,',
    '        file.filename or "upload",',
    '        business,',
    '        db,')
fix("backend/main.py", 1497,
    '        ImportRunRequest(entity=entity, mapping=mapping_dict),',
    '        data,',
    '        file.filename or "upload",',
    '        business,',
    '        db,')
fix("backend/main.py", 1506,
    '        raise HTTPException(',
    '            status_code=400,',
    '            detail="The import failed and was rolled back. No data was written.",',
    '        )')
fix("backend/main.py", 1550,
    '    prod = (',
    '        await db.execute(select(func.count()).select_from(Product).where(*scope(Product)))',
    '    ).scalar() or 0')
fix("backend/main.py", 1551,
    '    cust = (',
    '        await db.execute(select(func.count()).select_from(Customer).where(*scope(Customer)))',
    '    ).scalar() or 0')
fix("backend/main.py", 1552,
    '    orders = (',
    '        await db.execute(select(func.count()).select_from(Order).where(*scope(Order)))',
    '    ).scalar() or 0')
fix("backend/main.py", 1647,
    '    nxt_month = (',
    '        date(today.year + 1, 1, 1)',
    '        if today.month == 12',
    '        else date(today.year, today.month + 1, 1)',
    '    )')
fix("backend/main.py", 1671,
    '    return await ai_forecast_mod.build_forecast(',
    '        db, business.id, currency=business.currency or "USD"',
    '    )')
fix("backend/main.py", 1820,
    '    since: Optional[datetime] = Query(',
    '        None, description="Delta cursor (ISO). Omit for a full dump."',
    '    ),')

# ---- backend/models.py ----
fix("backend/models.py", 372,
    '        return (',
    '            f"<AiUsage business={self.business_id} model={self.model!r} "',
    '            f"credits={self.credits_used}>"',
    '        )')

# ---- backend/notifications/daily_summary.py ----
fix("backend/notifications/daily_summary.py", 55,
    'async def _window_revenue_orders(',
    '    db, business_id: int, start: dt.date, end: dt.date',
    ') -> tuple[float, int]:')
fix("backend/notifications/daily_summary.py", 63,
    'def _month_to_date_points(',
    '    today: dt.date,',
    ') -> tuple[tuple[dt.date, dt.date], Optional[tuple[dt.date, dt.date]]]:')
fix("backend/notifications/daily_summary.py", 97,
    '        prev_mtd_rev, _ = await _window_revenue_orders(',
    '            db, business.id, prev_window[0], prev_window[1]',
    '        )')
fix("backend/notifications/daily_summary.py", 108,
    '    if (',
    '        vs_yesterday.change_percent is not None',
    '        and abs(vs_yesterday.change_percent) >= NOTABLE_SWING_PCT',
    '    ):')
fix("backend/notifications/daily_summary.py", 136,
    '        DailySummaryLowItem(',
    '            name=p.name,',
    '            sku=p.sku or "",',
    '            stock=p.current_stock or 0,',
    '            reorder_level=p.reorder_level or 0,',
    '        )')
fix("backend/notifications/daily_summary.py", 179,
    '        empty_message = (',
    '            "Once you import or record your first orders, your daily summary "',
    '            "appears here."',
    '        )')

# ---- backend/reports/__init__.py ----
fix("backend/reports/__init__.py", 5,
    '__all__ = [',
    '    "ReportFilters",',
    '    "FilterError",',
    '    "ReportData",',
    '    "build_report",',
    '    "REPORT_BUILDERS",',
    '    "REPORT_TITLES",',
    ']')

# ---- backend/reports/filters.py ----
fix("backend/reports/filters.py", 27,
    'VALID_COMPARES = (',
    '    COMPARE_NONE,',
    '    COMPARE_PREVIOUS_PERIOD,',
    '    COMPARE_PREVIOUS_MONTH,',
    '    COMPARE_PREVIOUS_YEAR,',
    ')')

# ---- backend/reports/service.py ----
fix("backend/reports/service.py", 66,
    '    generated_at: str = field(',
    '        default_factory=lambda: dt.datetime.now().isoformat(timespec="seconds")',
    '    )')
fix("backend/reports/service.py", 87,
    '                {',
    '                    "title": t.title,',
    '                    "columns": t.columns,',
    '                    "rows": t.rows,',
    '                    "numeric_cols": t.numeric_cols,',
    '                }')
fix("backend/reports/service.py", 212,
    '                    prev_series[_bucket_key(od, mode)] = prev_series.get(',
    '                        _bucket_key(od, mode), 0',
    '                    ) + (o.total_amount or 0)')
fix("backend/reports/service.py", 219,
    '    kpis[0].change_percent = (',
    '        _pct(revenue, prev_kpis.get("revenue")) if f.compare != "none" else None',
    '    )')
fix("backend/reports/service.py", 228,
    '                    cur_series[_bucket_key(od, mode)] = cur_series.get(',
    '                        _bucket_key(od, mode), 0',
    '                    ) + (o.total_amount or 0)')
fix("backend/reports/service.py", 240,
    '            {',
    '                "name": "Current period",',
    '                "data": [_round(cur_series.get(k, 0)) for k in sorted(cur_series)],',
    '            },')
fix("backend/reports/service.py", 248,
    '        series = [',
    '            {',
    '                "name": "Revenue",',
    '                "data": [_round(cur_series.get(k, 0)) for k in sorted(cur_series)],',
    '            }',
    '        ]')
fix("backend/reports/service.py", 255,
    '        pid, pname, cat, qty, _price, total, _ = (',
    '            r[2],',
    '            r[3],',
    '            r[4] or "Uncategorized",',
    '            r[5],',
    '            r[6],',
    '            r[7],',
    '            r[8],',
    '        )')
fix("backend/reports/service.py", 302,
    '        chart=ReportChart(',
    '            "line", [_fmt_bucket(k, mode) for k in sorted(cur_series)], series, money=True',
    '        ),')
fix("backend/reports/service.py", 305,
    '                        [',
    '                            [r["name"], r["units"], r["revenue"], f"{r[\'share\']}%"]',
    '                            for r in prod_rows',
    '                        ],',
    '                        [1, 2, 3]',
    '                    ),')
fix("backend/reports/service.py", 307,
    '                        [',
    '                            [r["category"], r["units"], r["revenue"], f"{r[\'share\']}%"]',
    '                            for r in cat_rows',
    '                        ],',
    '                        [1, 2, 3]',
    '                    ),')
fix("backend/reports/service.py", 316,
    '    names = {',
    '        "previous_period": "previous period",',
    '        "previous_month": "previous month",',
    '        "previous_year": "previous year",',
    '    }')
fix("backend/reports/service.py", 333,
    '    notes: list[str] = [',
    '        "Gross P&L — Co-op does not track operating expenses yet, so this is "',
    '        "revenue minus cost of goods, not a full accounting statement."',
    '    ]')
fix("backend/reports/service.py", 335,
    '        notes.append(',
    '            f"Cost data covers {coverage:.0f}% of sold-line value; products without "',
    '            "a cost price are excluded from COGS."',
    '        )')
fix("backend/reports/service.py", 341,
    '        Kpi(',
    '            "gross_margin",',
    '            "Gross margin",',
    '            _round(margin, 1) if margin is not None else 0,',
    '            "percent",',
    '        ),')
fix("backend/reports/service.py", 392,
    '          "margin": (',
    '              _round((d["revenue"] - d["cogs"]) / d["revenue"] * 100, 1)',
    '              if d["revenue"]',
    '              else None',
    '          )}')
fix("backend/reports/service.py", 397,
    '        "Most profitable products",',
    '        ["Product", "Units", "Revenue", "COGS", "Gross profit", "Margin"],')
fix("backend/reports/service.py", 405,
    '        [',
    '            [p["name"], p["units"], p["revenue"], p["cogs"], p["profit"], f"{p[\'margin\']}%"]',
    '            for p in lowest[:5]',
    '        ],')
fix("backend/reports/service.py", 417,
    '                          [',
    '                              {',
    '                                  "name": "Revenue",',
    '                                  "data": [',
    '                                      _round(rev_series.get(k, 0)) for k in sorted(rev_series)',
    '                                  ],',
    '                              },')
fix("backend/reports/service.py", 418,
    '                              {',
    '                                  "name": "Gross profit",',
    '                                  "data": [',
    '                                      _round(gp_series.get(k, 0)) for k in sorted(rev_series)',
    '                                  ],',
    '                              },',
    '                          ],')
fix("backend/reports/service.py", 455,
    '        notes.append(',
    '            f"{len(out)} product{\'s\' if len(out) != 1 else \'\'} out of stock — "',
    '            "these generate no revenue until restocked."',
    '        )')
fix("backend/reports/service.py", 462,
    '        by_cat[p.category or "Uncategorized"] = (',
    '            by_cat.get(p.category or "Uncategorized", 0) + value(p)',
    '        )')
fix("backend/reports/service.py", 479,
    '            StockMovement.created_at',
    '            < dt.datetime.combine(f.to_date + dt.timedelta(days=1), dt.time.min),')
fix("backend/reports/service.py", 509,
    '        chart=ReportChart(',
    '            "donut",',
    '            cats,',
    '            [{"name": "Value", "data": [_round(by_cat.get(c, 0)) for c in cats]}],',
    '            money=True,',
    '        ),')
fix("backend/reports/service.py", 512,
    '                        [',
    '                            [',
    '                                p.name,',
    '                                p.sku or "—",',
    '                                p.current_stock,',
    '                                p.reorder_level or 0,',
    '                                _round(value(p)),',
    '                            ]',
    '                            for p in risk[:15]',
    '                        ],')
fix("backend/reports/service.py", 515,
    '                        [',
    '                            [',
    '                                p.name,',
    '                                p.current_stock or 0,',
    '                                _round(p.cost_price or p.unit_price),',
    '                                _round(value(p)),',
    '                            ]',
    '                            for p in top_value',
    '                        ],')
fix("backend/reports/service.py", 518,
    '                        [',
    '                            [n, d["in"], d["out"], d["in"] - d["out"]]',
    '                            for n, d in mv_rows',
    '                        ],',
    '                        [1, 2, 3]',
    '                    ),')
fix("backend/reports/service.py", 559,
    '            period_revenue_by_cust[o.customer_id] = (',
    '                period_revenue_by_cust.get(o.customer_id, 0) + (o.total_amount or 0)',
    '            )')
fix("backend/reports/service.py", 598,
    '        notes.append(',
    '            f"{len(inactive)} customer{\'s\' if len(inactive) != 1 else \'\'} haven\'t "',
    '            "ordered in 30+ days — the top ones are listed below."',
    '        )')
fix("backend/reports/service.py", 638,
    '                          [',
    '                              {',
    '                                  "name": "New customers",',
    '                                  "data": [',
    '                                      new_series.get(k, 0) for k in sorted(new_series)',
    '                                  ],',
    '                              }',
    '                          ]),')
fix("backend/reports/service.py", 640,
    '            ReportTable(',
    '                "Top customers (period)",',
    '                ["Customer", "Orders", "Revenue (period)", "Lifetime revenue", "Last order"],')

# ---- backend/sync.py ----
fix("backend/sync.py", 112,
    '    return {',
    '        "id": row.id,',
    '        "client_id": row.client_id,',
    '        "full_name": row.full_name,',
    '        "email": row.email,',
    '    }')
fix("backend/sync.py", 149,
    'async def _resolve_ref(',
    '    db, model, client_id: Optional[str], server_id: Optional[int], business_id: int',
    ') -> Optional[int]:')
fix("backend/sync.py", 211,
    '                server_id, created = await _apply_customer(',
    '                    db, business_id, client_id, operation, payload',
    '                )')
fix("backend/sync.py", 213,
    '                server_id, created = await _apply_product(',
    '                    db, business_id, client_id, operation, payload',
    '                )')
fix("backend/sync.py", 215,
    '                server_id, created = await _apply_order(',
    '                    db, business_id, client_id, operation, payload',
    '                )')
fix("backend/sync.py", 217,
    '                server_id, created = await _apply_order_item(',
    '                    db, business_id, client_id, operation, payload',
    '                )')
fix("backend/sync.py", 219,
    '                server_id, created = await _apply_stock_movement(',
    '                    db, business_id, client_id, operation, payload',
    '                )')
fix("backend/sync.py", 366,
    '            for f in (',
    '                "name",',
    '                "sku",',
    '                "category",',
    '                "description",',
    '                "unit_price",',
    '                "cost_price",',
    '                "reorder_level",',
    '            ):')
fix("backend/sync.py", 460,
    '    customer_id = await _resolve_ref(',
    '        db,',
    '        Customer,',
    '        payload.get("customer_client_id"),',
    '        payload.get("customer_server_id"),',
    '        business_id,',
    '    )')
fix("backend/sync.py", 464,
    '            (',
    '                f"(client_id={payload.get(\'customer_client_id\')!r}, "',
    '                f"server_id={payload.get(\'customer_server_id\')!r})"',
    '            ),')
fix("backend/sync.py", 466,
    '            local={',
    '                "customer_client_id": payload.get("customer_client_id"),',
    '                "customer_server_id": payload.get("customer_server_id"),',
    '            },')
fix("backend/sync.py", 491,
    '    order_id = await _resolve_ref(',
    '        db,',
    '        Order,',
    '        payload.get("order_client_id"),',
    '        payload.get("order_server_id"),',
    '        business_id,',
    '    )')
fix("backend/sync.py", 492,
    '    product_id = await _resolve_ref(',
    '        db,',
    '        Product,',
    '        payload.get("product_client_id"),',
    '        payload.get("product_server_id"),',
    '        business_id,',
    '    )')
fix("backend/sync.py", 496,
    '            (',
    '                f"(client_id={payload.get(\'order_client_id\')!r}, "',
    '                f"server_id={payload.get(\'order_server_id\')!r})"',
    '            ),')
fix("backend/sync.py", 498,
    '            local={',
    '                "order_client_id": payload.get("order_client_id"),',
    '                "order_server_id": payload.get("order_server_id"),',
    '            },')
fix("backend/sync.py", 503,
    '            (',
    '                f"(client_id={payload.get(\'product_client_id\')!r}, "',
    '                f"server_id={payload.get(\'product_server_id\')!r})"',
    '            ),')
fix("backend/sync.py", 505,
    '            local={',
    '                "product_client_id": payload.get("product_client_id"),',
    '                "product_server_id": payload.get("product_server_id"),',
    '            },')
fix("backend/sync.py", 532,
    '        raise SyncError(',
    '            f"stock_movement {client_id}: operation {operation} without an existing row"',
    '        )')
fix("backend/sync.py", 533,
    '    product_id = await _resolve_ref(',
    '        db,',
    '        Product,',
    '        payload.get("product_client_id"),',
    '        payload.get("product_server_id"),',
    '        business_id,',
    '    )')
fix("backend/sync.py", 537,
    '            (',
    '                f"(client_id={payload.get(\'product_client_id\')!r}, "',
    '                f"server_id={payload.get(\'product_server_id\')!r})"',
    '            ),')
fix("backend/sync.py", 539,
    '            local={',
    '                "product_client_id": payload.get("product_client_id"),',
    '                "product_server_id": payload.get("product_server_id"),',
    '            },')

# ---- backend/tests ----
fix("backend/tests/smoke_import.py", 110,
    '        action = (',
    '            f"  [ACTION {i[\'action\'][\'type\']} -> "',
    '            f"customer {i[\'action\'][\'customer\'][\'full_name\']} x product "',
    '            f"{i[\'action\'][\'product\'][\'name\'] if i[\'action\'][\'product\'] else None}]"',
    '            if i["action"]',
    '            else ""',
    '        )')
fix("backend/tests/test_daily_summary.py", 22,
    'async def _seed(',
    '    session_factory,',
    '    *,',
    '    products=None,',
    '    customers=None,',
    '    orders=None,',
    '    business_name="Test Co",',
    '):')
fix("backend/tests/test_openai_provider.py", 33,
    '                              "content": (',
    '                                  \'{"type": "answer", "kind": "fact", "title": "t", \'',
    '                                  \'"message": "m", "basis": {"period": "last_30_days", \'',
    '                                  \'"sources": ["orders"]}, "follow_ups": [], "links": [], \'',
    '                                  \'"actions": []}\'',
    '                              )}},')
fix("backend/tests/test_reports.py", 99,
    '        r = await build_report(',
    '            db, bid, "sales", ReportFilters.from_query(compare="previous_period")',
    '        )')
fix("backend/tests/test_reports.py", 215,
    '        r = await build_report(',
    '            db, bid, "sales", ReportFilters.from_query(compare="previous_period")',
    '        )')
fix("backend/tests/test_reports.py", 228,
    '        r = await build_report(',
    '            db, bid, "sales", ReportFilters.from_query(compare="previous_period")',
    '        )')
fix("backend/tests/test_sync.py", 13,
    '            "payload": {',
    '                "full_name": name,',
    '                "email": email,',
    '                "phone": None,',
    '                "company": None,',
    '                "address": None,',
    '            }}')
fix("backend/tests/test_sync.py", 22,
    '                        "current_stock": stock,',
    '                        "reorder_level": 5,',
    '                        "category": None,',
    '                        "description": None,',
    '                    }}')
fix("backend/tests/test_sync.py", 69,
    '             "payload": {',
    '                 "full_name": "Grace H",',
    '                 "email": None,',
    '                 "phone": "555",',
    '                 "company": None,',
    '                 "address": None,',
    '             }},')
fix("backend/tests/test_sync.py", 181,
    '             "payload": {',
    '                 "name": "Http Chair",',
    '                 "sku": "HC1",',
    '                 "unit_price": 50.0,',
    '                 "current_stock": 5,',
    '             }},')
fix("backend/tests/test_sync.py", 314,
    '            _cust("CUST1"),',
    '            _prod("PROD1", stock=10),',
    '            *_prod_initial("PROD1", 10),',
    '            _order("ORD1", "CUST1"),')
fix("backend/tests/test_sync.py", 573,
    '        assert set(c.keys()) == {',
    '            "operation_id",',
    '            "entity",',
    '            "client_id",',
    '            "reason",',
    '            "error",',
    '            "local",',
    '            "server",',
    '        }')
fix("backend/tests/test_sync_cursor.py", 38,
    '        db.add(',
    '            Customer(',
    '                business_id=biz_id,',
    '                full_name="Cloud Cust",',
    '                email="cc@x.com",',
    '                client_id=None,',
    '            )',
    '        )')
fix("backend/tests/test_sync_cursor.py", 143,
    '    await api.client.post(',
    '        "/products",',
    '        json={"sku": "CH1", "name": "Chair", "unit_price": 100.0, "current_stock": 5},',
    '    )')


def main() -> int:
    by_file: dict[str, dict[int, tuple[list[str], int]]] = {}
    for path, lineno, new_lines, consume in FIXES:
        by_file.setdefault(path, {})[lineno] = (new_lines, consume)

    problems = 0
    for path, fixes in by_file.items():
        full = os.path.join(ROOT, path)
        with open(full) as f:
            lines = f.readlines()
        new_lines = list(lines)
        for lineno in sorted(fixes, reverse=True):
            replacement, consume = fixes[lineno]
            old = lines[lineno - 1].rstrip("\n")
            rendered = []
            indent = old[: len(old) - len(old.lstrip())]
            for r in replacement:
                r = r.replace("{INDENT}", indent).replace("{INDENTB}", indent + "    ")
                rendered.append(r)
            new_lines[lineno - 1 : lineno - 1 + consume] = [r + "\n" for r in rendered]
        src = "".join(new_lines)
        try:
            ast.parse(src)
        except SyntaxError as e:
            print(f"SYNTAX ERROR after applying {path}: {e}")
            problems += 1
            continue
        with open(full, "w") as f:
            f.write(src)
        print(f"applied {len(fixes)} fixes to {path}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
