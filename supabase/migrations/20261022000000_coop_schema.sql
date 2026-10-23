-- Co-op schema snapshot — GENERATED, DO NOT EDIT BY HAND.
--
-- Regenerate with:  python supabase/scripts/export_schema.py
-- Source of truth:  backend/alembic/versions/ (revision 0019_business_logo (head))
--
-- Apply in the Supabase SQL editor, or with:
--     supabase db push
-- or directly:
--     psql "$DATABASE_URL" -f supabase/migrations/20261022000000_coop_schema.sql

SET statement_timeout = 0;
SET client_encoding = 'UTF8';

--
-- PostgreSQL database dump
--

-- Dumped from database version 16.2
-- Dumped by pg_dump version 16.2

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ai_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_history (
    id bigint NOT NULL,
    business_id integer NOT NULL,
    user_id character varying(255),
    request_id character varying(64),
    question text NOT NULL,
    answer_kind character varying(20),
    answer_title character varying(255),
    answer_summary text,
    report_key character varying(20),
    model character varying(64),
    credits_used integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_history_id_seq OWNED BY public.ai_history.id;


--
-- Name: ai_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_usage (
    id bigint NOT NULL,
    business_id integer NOT NULL,
    user_id character varying(255),
    request_id character varying(64),
    model character varying(64),
    input_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    credits_used integer DEFAULT 0 NOT NULL,
    answer_kind character varying(20),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_usage_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_usage_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_usage_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_usage_id_seq OWNED BY public.ai_usage.id;


--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


--
-- Name: analytics_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analytics_snapshots (
    id bigint NOT NULL,
    business_id integer,
    snapshot_date timestamp with time zone DEFAULT now() NOT NULL,
    metric_key character varying(50) NOT NULL,
    metric_value double precision,
    dimensions_json text
);


--
-- Name: analytics_snapshots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.analytics_snapshots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: analytics_snapshots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.analytics_snapshots_id_seq OWNED BY public.analytics_snapshots.id;


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id bigint NOT NULL,
    table_name character varying(50) NOT NULL,
    record_id integer,
    action character varying(20) NOT NULL,
    actor character varying(255),
    change_json text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    business_id integer
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: business_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_invitations (
    id integer NOT NULL,
    business_id integer NOT NULL,
    email character varying(255) NOT NULL,
    role character varying(20) NOT NULL,
    token character varying(64) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    created_by character varying(255),
    accepted_by character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp without time zone
);


--
-- Name: business_invitations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.business_invitations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: business_invitations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.business_invitations_id_seq OWNED BY public.business_invitations.id;


--
-- Name: business_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_members (
    id integer NOT NULL,
    business_id integer NOT NULL,
    user_id character varying(255) NOT NULL,
    email character varying(255),
    role character varying(20) NOT NULL,
    invited_by character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: business_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.business_members_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: business_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.business_members_id_seq OWNED BY public.business_members.id;


--
-- Name: businesses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.businesses (
    id bigint NOT NULL,
    name character varying(255) NOT NULL,
    owner_id character varying(255),
    owner_email character varying(255),
    industry character varying(100),
    currency character varying(8) DEFAULT 'USD'::character varying,
    address character varying(500),
    phone character varying(20),
    tax_id character varying(100),
    website character varying(255),
    timezone character varying(64),
    created_by character varying(255),
    updated_by character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    deleted_by character varying(255),
    version integer DEFAULT 1 NOT NULL,
    ai_response_style character varying(20) DEFAULT 'standard'::character varying NOT NULL,
    logo_url character varying(1024)
);


--
-- Name: businesses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.businesses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: businesses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.businesses_id_seq OWNED BY public.businesses.id;


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id bigint NOT NULL,
    business_id integer,
    full_name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    phone character varying(20),
    address character varying(500),
    company character varying(255),
    password_hash character varying(255),
    created_by character varying(255),
    updated_by character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    deleted_by character varying(255),
    version integer DEFAULT 1 NOT NULL,
    import_batch_id integer,
    client_id character varying(26)
);


--
-- Name: customers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customers_id_seq OWNED BY public.customers.id;


--
-- Name: feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feedback (
    id integer NOT NULL,
    business_id integer NOT NULL,
    submitted_by character varying(255),
    kind character varying(12) DEFAULT 'submitted'::character varying NOT NULL,
    rating integer,
    overall text,
    likes text,
    issues text,
    improvements text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: feedback_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.feedback_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: feedback_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.feedback_id_seq OWNED BY public.feedback.id;


--
-- Name: import_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_batches (
    id bigint NOT NULL,
    business_id integer NOT NULL,
    dataset character varying(20) NOT NULL,
    filename character varying(255),
    row_count integer DEFAULT 0 NOT NULL,
    created_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: import_batches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.import_batches_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: import_batches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.import_batches_id_seq OWNED BY public.import_batches.id;


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id integer NOT NULL,
    business_id integer NOT NULL,
    order_id integer NOT NULL,
    number character varying(20) NOT NULL,
    issue_date timestamp without time zone NOT NULL,
    due_date timestamp without time zone,
    notes text,
    status character varying(10) DEFAULT 'draft'::character varying NOT NULL,
    created_by character varying(255),
    updated_by character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoices_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invoices_id_seq OWNED BY public.invoices.id;


--
-- Name: issue_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.issue_reports (
    id bigint NOT NULL,
    business_id integer NOT NULL,
    submitted_by character varying(255),
    category character varying(32) DEFAULT 'other'::character varying NOT NULL,
    severity character varying(16) DEFAULT 'normal'::character varying NOT NULL,
    subject character varying(200) NOT NULL,
    description text NOT NULL,
    contact_email character varying(255),
    app_version character varying(64),
    platform character varying(32),
    status character varying(16) DEFAULT 'new'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: issue_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.issue_reports_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: issue_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.issue_reports_id_seq OWNED BY public.issue_reports.id;


--
-- Name: licenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.licenses (
    id integer NOT NULL,
    business_id integer NOT NULL,
    fingerprint character varying(64) NOT NULL,
    plan character varying(20) NOT NULL,
    seats integer DEFAULT 1 NOT NULL,
    issued_at timestamp without time zone,
    activated_at timestamp without time zone,
    activated_by character varying(255),
    expires_at timestamp without time zone,
    revoked_at timestamp without time zone,
    revoked_reason character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: licenses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.licenses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: licenses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.licenses_id_seq OWNED BY public.licenses.id;


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id bigint NOT NULL,
    business_id integer,
    order_id integer NOT NULL,
    product_id integer NOT NULL,
    quantity integer NOT NULL,
    unit_price double precision NOT NULL,
    total_price double precision NOT NULL,
    created_by character varying(255),
    updated_by character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    deleted_by character varying(255),
    version integer DEFAULT 1 NOT NULL,
    import_batch_id integer,
    client_id character varying(26)
);


--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_items_id_seq OWNED BY public.order_items.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id bigint NOT NULL,
    business_id integer,
    customer_id integer NOT NULL,
    order_date timestamp with time zone DEFAULT now() NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    total_amount double precision DEFAULT 0.0 NOT NULL,
    created_by character varying(255),
    updated_by character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    deleted_by character varying(255),
    version integer DEFAULT 1 NOT NULL,
    import_batch_id integer,
    source_order_ref character varying(100),
    client_id character varying(26)
);


--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id integer NOT NULL,
    business_id integer NOT NULL,
    provider character varying(30) DEFAULT 'paystack'::character varying NOT NULL,
    reference character varying(80) NOT NULL,
    plan character varying(20) NOT NULL,
    "interval" character varying(20) DEFAULT 'monthly'::character varying NOT NULL,
    mode character varying(20),
    amount_kobo integer,
    currency character varying(8),
    email character varying(255),
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    provider_status character varying(40),
    channel character varying(40),
    metadata_json text,
    started_by character varying(255),
    paid_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id bigint NOT NULL,
    business_id integer,
    sku character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    description character varying(1000),
    category character varying(100),
    unit_price double precision NOT NULL,
    cost_price double precision,
    current_stock integer DEFAULT 0 NOT NULL,
    reorder_level integer DEFAULT 5 NOT NULL,
    created_by character varying(255),
    updated_by character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    deleted_by character varying(255),
    version integer DEFAULT 1 NOT NULL,
    import_batch_id integer,
    client_id character varying(26)
);


--
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.products_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.products_id_seq OWNED BY public.products.id;


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id bigint NOT NULL,
    clerk_user_id character varying(255) NOT NULL,
    full_name character varying(255),
    email character varying(255),
    avatar_url character varying(1024),
    phone_number character varying(40),
    preferred_language character varying(16) DEFAULT 'en'::character varying,
    timezone character varying(64),
    created_by character varying(255),
    updated_by character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    deleted_at timestamp with time zone,
    deleted_by character varying(255),
    version integer DEFAULT 1 NOT NULL
);


--
-- Name: profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.profiles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.profiles_id_seq OWNED BY public.profiles.id;


--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movements (
    id bigint NOT NULL,
    business_id integer NOT NULL,
    product_id integer NOT NULL,
    change integer NOT NULL,
    reason character varying(20) NOT NULL,
    note character varying(500),
    order_id integer,
    actor character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    client_id character varying(26)
);


--
-- Name: stock_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_movements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_movements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_movements_id_seq OWNED BY public.stock_movements.id;


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id bigint NOT NULL,
    business_id integer NOT NULL,
    plan character varying(20) DEFAULT 'free'::character varying NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    updated_by character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    trial_plan character varying(20),
    trial_started_at timestamp with time zone,
    trial_ends_at timestamp with time zone,
    license_plan character varying(20),
    license_seats integer,
    license_started_at timestamp with time zone,
    license_ends_at timestamp with time zone,
    license_fingerprint character varying(64)
);


--
-- Name: subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.subscriptions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.subscriptions_id_seq OWNED BY public.subscriptions.id;


--
-- Name: sync_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_queue (
    id bigint NOT NULL,
    business_id integer,
    entity_type character varying(50) NOT NULL,
    entity_id integer NOT NULL,
    operation character varying(20) NOT NULL,
    payload text,
    status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    synced_at timestamp with time zone
);


--
-- Name: sync_queue_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sync_queue_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sync_queue_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sync_queue_id_seq OWNED BY public.sync_queue.id;


--
-- Name: ai_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_history ALTER COLUMN id SET DEFAULT nextval('public.ai_history_id_seq'::regclass);


--
-- Name: ai_usage id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage ALTER COLUMN id SET DEFAULT nextval('public.ai_usage_id_seq'::regclass);


--
-- Name: analytics_snapshots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_snapshots ALTER COLUMN id SET DEFAULT nextval('public.analytics_snapshots_id_seq'::regclass);


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: business_invitations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_invitations ALTER COLUMN id SET DEFAULT nextval('public.business_invitations_id_seq'::regclass);


--
-- Name: business_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_members ALTER COLUMN id SET DEFAULT nextval('public.business_members_id_seq'::regclass);


--
-- Name: businesses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.businesses ALTER COLUMN id SET DEFAULT nextval('public.businesses_id_seq'::regclass);


--
-- Name: customers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers ALTER COLUMN id SET DEFAULT nextval('public.customers_id_seq'::regclass);


--
-- Name: feedback id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback ALTER COLUMN id SET DEFAULT nextval('public.feedback_id_seq'::regclass);


--
-- Name: import_batches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_batches ALTER COLUMN id SET DEFAULT nextval('public.import_batches_id_seq'::regclass);


--
-- Name: invoices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices ALTER COLUMN id SET DEFAULT nextval('public.invoices_id_seq'::regclass);


--
-- Name: issue_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_reports ALTER COLUMN id SET DEFAULT nextval('public.issue_reports_id_seq'::regclass);


--
-- Name: licenses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.licenses ALTER COLUMN id SET DEFAULT nextval('public.licenses_id_seq'::regclass);


--
-- Name: order_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items ALTER COLUMN id SET DEFAULT nextval('public.order_items_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);


--
-- Name: products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products ALTER COLUMN id SET DEFAULT nextval('public.products_id_seq'::regclass);


--
-- Name: profiles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles ALTER COLUMN id SET DEFAULT nextval('public.profiles_id_seq'::regclass);


--
-- Name: stock_movements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements ALTER COLUMN id SET DEFAULT nextval('public.stock_movements_id_seq'::regclass);


--
-- Name: subscriptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions ALTER COLUMN id SET DEFAULT nextval('public.subscriptions_id_seq'::regclass);


--
-- Name: sync_queue id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_queue ALTER COLUMN id SET DEFAULT nextval('public.sync_queue_id_seq'::regclass);


--
-- Name: ai_history ai_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_history
    ADD CONSTRAINT ai_history_pkey PRIMARY KEY (id);


--
-- Name: ai_usage ai_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage
    ADD CONSTRAINT ai_usage_pkey PRIMARY KEY (id);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: analytics_snapshots analytics_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_snapshots
    ADD CONSTRAINT analytics_snapshots_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: business_invitations business_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_invitations
    ADD CONSTRAINT business_invitations_pkey PRIMARY KEY (id);


--
-- Name: business_invitations business_invitations_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_invitations
    ADD CONSTRAINT business_invitations_token_key UNIQUE (token);


--
-- Name: business_members business_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_members
    ADD CONSTRAINT business_members_pkey PRIMARY KEY (id);


--
-- Name: businesses businesses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.businesses
    ADD CONSTRAINT businesses_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: feedback feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);


--
-- Name: import_batches import_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_batches
    ADD CONSTRAINT import_batches_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: issue_reports issue_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_reports
    ADD CONSTRAINT issue_reports_pkey PRIMARY KEY (id);


--
-- Name: licenses licenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT licenses_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_clerk_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_clerk_user_id_key UNIQUE (clerk_user_id);


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: sync_queue sync_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_queue
    ADD CONSTRAINT sync_queue_pkey PRIMARY KEY (id);


--
-- Name: invoices uq_invoices_business_number; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT uq_invoices_business_number UNIQUE (business_id, number);


--
-- Name: invoices uq_invoices_business_order; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT uq_invoices_business_order UNIQUE (business_id, order_id);


--
-- Name: licenses uq_licenses_fingerprint; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT uq_licenses_fingerprint UNIQUE (fingerprint);


--
-- Name: business_members uq_member_business_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_members
    ADD CONSTRAINT uq_member_business_user UNIQUE (business_id, user_id);


--
-- Name: payments uq_payments_reference; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT uq_payments_reference UNIQUE (reference);


--
-- Name: idx_ai_history_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_history_business ON public.ai_history USING btree (business_id);


--
-- Name: idx_ai_history_business_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_history_business_created ON public.ai_history USING btree (business_id, created_at);


--
-- Name: idx_ai_history_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_history_request ON public.ai_history USING btree (request_id);


--
-- Name: idx_ai_usage_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_business ON public.ai_usage USING btree (business_id);


--
-- Name: idx_ai_usage_business_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_business_created ON public.ai_usage USING btree (business_id, created_at);


--
-- Name: idx_ai_usage_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_request ON public.ai_usage USING btree (request_id);


--
-- Name: idx_businesses_owner_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_owner_email ON public.businesses USING btree (owner_email);


--
-- Name: idx_businesses_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_businesses_owner_id ON public.businesses USING btree (owner_id);


--
-- Name: idx_customers_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_business ON public.customers USING btree (business_id);


--
-- Name: idx_customers_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_email ON public.customers USING btree (email);


--
-- Name: idx_customers_import_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_import_batch ON public.customers USING btree (import_batch_id);


--
-- Name: idx_import_batches_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_batches_business ON public.import_batches USING btree (business_id);


--
-- Name: idx_order_items_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_business ON public.order_items USING btree (business_id);


--
-- Name: idx_order_items_import_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_import_batch ON public.order_items USING btree (import_batch_id);


--
-- Name: idx_order_items_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id);


--
-- Name: idx_order_items_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_product ON public.order_items USING btree (product_id);


--
-- Name: idx_orders_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_business ON public.orders USING btree (business_id);


--
-- Name: idx_orders_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_customer ON public.orders USING btree (customer_id);


--
-- Name: idx_orders_import_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_import_batch ON public.orders USING btree (import_batch_id);


--
-- Name: idx_orders_source_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_source_ref ON public.orders USING btree (source_order_ref);


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_status ON public.orders USING btree (status);


--
-- Name: idx_products_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_business ON public.products USING btree (business_id);


--
-- Name: idx_products_import_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_import_batch ON public.products USING btree (import_batch_id);


--
-- Name: idx_products_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_sku ON public.products USING btree (sku);


--
-- Name: idx_stock_movements_business; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_business ON public.stock_movements USING btree (business_id);


--
-- Name: idx_stock_movements_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_product ON public.stock_movements USING btree (product_id);


--
-- Name: ix_audit_log_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_log_business_id ON public.audit_log USING btree (business_id);


--
-- Name: ix_business_invitations_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_business_invitations_business_id ON public.business_invitations USING btree (business_id);


--
-- Name: ix_business_members_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_business_members_business_id ON public.business_members USING btree (business_id);


--
-- Name: ix_business_members_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_business_members_user_id ON public.business_members USING btree (user_id);


--
-- Name: ix_feedback_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_feedback_business_id ON public.feedback USING btree (business_id);


--
-- Name: ix_invoices_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_invoices_business_id ON public.invoices USING btree (business_id);


--
-- Name: ix_issue_reports_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_issue_reports_business_id ON public.issue_reports USING btree (business_id);


--
-- Name: ix_licenses_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_licenses_business_id ON public.licenses USING btree (business_id);


--
-- Name: ix_payments_business_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_payments_business_id ON public.payments USING btree (business_id);


--
-- Name: ix_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_payments_status ON public.payments USING btree (business_id, status);


--
-- Name: uq_customers_business_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_customers_business_email ON public.customers USING btree (business_id, email) WHERE (deleted_at IS NULL);


--
-- Name: uq_customers_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_customers_client_id ON public.customers USING btree (client_id);


--
-- Name: uq_order_items_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_order_items_client_id ON public.order_items USING btree (client_id);


--
-- Name: uq_orders_business_source_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_orders_business_source_ref ON public.orders USING btree (business_id, source_order_ref) WHERE ((deleted_at IS NULL) AND (source_order_ref IS NOT NULL));


--
-- Name: uq_orders_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_orders_client_id ON public.orders USING btree (client_id);


--
-- Name: uq_products_business_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_products_business_sku ON public.products USING btree (business_id, sku) WHERE (deleted_at IS NULL);


--
-- Name: uq_products_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_products_client_id ON public.products USING btree (client_id);


--
-- Name: uq_stock_movements_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_stock_movements_client_id ON public.stock_movements USING btree (client_id);


--
-- Name: uq_subscriptions_business; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_subscriptions_business ON public.subscriptions USING btree (business_id);


--
-- Name: business_invitations business_invitations_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_invitations
    ADD CONSTRAINT business_invitations_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id);


--
-- Name: business_members business_members_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_members
    ADD CONSTRAINT business_members_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id);


--
-- Name: feedback feedback_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id);


--
-- Name: customers fk_customers_import_batch; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT fk_customers_import_batch FOREIGN KEY (import_batch_id) REFERENCES public.import_batches(id);


--
-- Name: order_items fk_order_items_import_batch; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT fk_order_items_import_batch FOREIGN KEY (import_batch_id) REFERENCES public.import_batches(id);


--
-- Name: order_items fk_order_items_order_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT fk_order_items_order_id FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: order_items fk_order_items_product_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT fk_order_items_product_id FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: orders fk_orders_customer_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT fk_orders_customer_id FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: orders fk_orders_import_batch; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT fk_orders_import_batch FOREIGN KEY (import_batch_id) REFERENCES public.import_batches(id);


--
-- Name: products fk_products_import_batch; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT fk_products_import_batch FOREIGN KEY (import_batch_id) REFERENCES public.import_batches(id);


--
-- Name: stock_movements fk_stock_movements_product_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT fk_stock_movements_product_id FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: invoices invoices_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id);


--
-- Name: invoices invoices_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: issue_reports issue_reports_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issue_reports
    ADD CONSTRAINT issue_reports_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id);


--
-- Name: licenses licenses_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT licenses_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id);


--
-- Name: payments payments_business_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.businesses(id);


--
-- Name: ai_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_history ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

--
-- Name: analytics_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.analytics_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: business_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: business_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;

--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: import_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: issue_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.issue_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: licenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: sync_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sync_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_history tenant_isolation_ai_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_ai_history ON public.ai_history USING ((business_id = (current_setting('app.business_id'::text, true))::integer)) WITH CHECK ((business_id = (current_setting('app.business_id'::text, true))::integer));


--
-- Name: ai_usage tenant_isolation_ai_usage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_ai_usage ON public.ai_usage USING ((business_id = (current_setting('app.business_id'::text, true))::integer)) WITH CHECK ((business_id = (current_setting('app.business_id'::text, true))::integer));


--
-- Name: analytics_snapshots tenant_isolation_analytics_snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_analytics_snapshots ON public.analytics_snapshots USING ((business_id = (current_setting('app.business_id'::text, true))::integer)) WITH CHECK ((business_id = (current_setting('app.business_id'::text, true))::integer));


--
-- Name: audit_log tenant_isolation_audit_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_audit_log ON public.audit_log USING ((business_id = (current_setting('app.business_id'::text, true))::integer)) WITH CHECK ((business_id = (current_setting('app.business_id'::text, true))::integer));


--
-- Name: business_invitations tenant_isolation_business_invitations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_business_invitations ON public.business_invitations USING ((business_id = (current_setting('app.business_id'::text, true))::integer)) WITH CHECK ((business_id = (current_setting('app.business_id'::text, true))::integer));


--
-- Name: business_members tenant_isolation_business_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_business_members ON public.business_members USING ((business_id = (current_setting('app.business_id'::text, true))::integer)) WITH CHECK ((business_id = (current_setting('app.business_id'::text, true))::integer));


--
-- Name: customers tenant_isolation_customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_customers ON public.customers USING ((business_id = (current_setting('app.business_id'::text, true))::integer)) WITH CHECK ((business_id = (current_setting('app.business_id'::text, true))::integer));


--
-- Name: import_batches tenant_isolation_import_batches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_import_batches ON public.import_batches USING ((business_id = (current_setting('app.business_id'::text, true))::integer)) WITH CHECK ((business_id = (current_setting('app.business_id'::text, true))::integer));


--
-- Name: invoices tenant_isolation_invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_invoices ON public.invoices USING ((business_id = (current_setting('app.business_id'::text, true))::integer)) WITH CHECK ((business_id = (current_setting('app.business_id'::text, true))::integer));


--
-- Name: issue_reports tenant_isolation_issue_reports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_issue_reports ON public.issue_reports USING ((business_id = (current_setting('app.business_id'::text, true))::integer)) WITH CHECK ((business_id = (current_setting('app.business_id'::text, true))::integer));


--
-- Name: licenses tenant_isolation_licenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_licenses ON public.licenses USING ((business_id = (current_setting('app.business_id'::text, true))::integer)) WITH CHECK ((business_id = (current_setting('app.business_id'::text, true))::integer));


--
-- Name: order_items tenant_isolation_order_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_order_items ON public.order_items USING ((business_id = (current_setting('app.business_id'::text, true))::integer)) WITH CHECK ((business_id = (current_setting('app.business_id'::text, true))::integer));


--
-- Name: orders tenant_isolation_orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_orders ON public.orders USING ((business_id = (current_setting('app.business_id'::text, true))::integer)) WITH CHECK ((business_id = (current_setting('app.business_id'::text, true))::integer));


--
-- Name: payments tenant_isolation_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_payments ON public.payments USING ((business_id = (current_setting('app.business_id'::text, true))::integer)) WITH CHECK ((business_id = (current_setting('app.business_id'::text, true))::integer));


--
-- Name: products tenant_isolation_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_products ON public.products USING ((business_id = (current_setting('app.business_id'::text, true))::integer)) WITH CHECK ((business_id = (current_setting('app.business_id'::text, true))::integer));


--
-- Name: stock_movements tenant_isolation_stock_movements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_stock_movements ON public.stock_movements USING ((business_id = (current_setting('app.business_id'::text, true))::integer)) WITH CHECK ((business_id = (current_setting('app.business_id'::text, true))::integer));


--
-- Name: subscriptions tenant_isolation_subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_subscriptions ON public.subscriptions USING ((business_id = (current_setting('app.business_id'::text, true))::integer)) WITH CHECK ((business_id = (current_setting('app.business_id'::text, true))::integer));


--
-- Name: sync_queue tenant_isolation_sync_queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_sync_queue ON public.sync_queue USING ((business_id = (current_setting('app.business_id'::text, true))::integer)) WITH CHECK ((business_id = (current_setting('app.business_id'::text, true))::integer));


--
-- PostgreSQL database dump complete
--

