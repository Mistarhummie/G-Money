CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"product_id" text NOT NULL,
	"face_cents" integer NOT NULL,
	"cost_usd_cents" integer NOT NULL,
	"price_kes" integer NOT NULL,
	"fee_kes" integer DEFAULT 0 NOT NULL,
	"total_kes" integer NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"payment_ref" text,
	"payment_receipt" text,
	"payer_email" text,
	"held_reason" text,
	"failure_reason" text,
	"supplier_tx_id" text,
	"code_encrypted" text,
	"pin_encrypted" text,
	"tournament_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier" text NOT NULL,
	"supplier_product_id" text NOT NULL,
	"brand" text NOT NULL,
	"name" text NOT NULL,
	"country_code" text NOT NULL,
	"currency" text NOT NULL,
	"denominations" jsonb NOT NULL,
	"logo_url" text,
	"redeem_instructions" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "prize_product_id" text;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "prize_face_values_cents" jsonb;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_user_idx" ON "orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_payment_ref_idx" ON "orders" USING btree ("payment_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "products_supplier_idx" ON "products" USING btree ("supplier","supplier_product_id");