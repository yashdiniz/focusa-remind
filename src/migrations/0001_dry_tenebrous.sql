CREATE TABLE "focusa_remind_memory" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"parent_id" uuid,
	"edgeType" text,
	"fact" text NOT NULL,
	"embedding" halfvec(768) NOT NULL,
	"metadata" jsonb NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "focusa_remind_message" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"sent_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"role" text NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"content" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "focusa_remind_reminder" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"sent" boolean DEFAULT false NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"title" text NOT NULL,
	"due_at" timestamp with time zone,
	"priority" text DEFAULT 'low' NOT NULL,
	"rrule" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "focusa_remind_user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"identifier" varchar(255) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "focusa_remind_memory" ADD CONSTRAINT "focusa_remind_memory_user_id_focusa_remind_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."focusa_remind_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focusa_remind_memory" ADD CONSTRAINT "memory_parent_id_fk_idx" FOREIGN KEY ("parent_id") REFERENCES "public"."focusa_remind_memory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focusa_remind_message" ADD CONSTRAINT "focusa_remind_message_user_id_focusa_remind_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."focusa_remind_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focusa_remind_reminder" ADD CONSTRAINT "focusa_remind_reminder_user_id_focusa_remind_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."focusa_remind_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_embedding_idx" ON "focusa_remind_memory" USING hnsw ("embedding" halfvec_cosine_ops);--> statement-breakpoint
CREATE INDEX "message_user_sentat_idx" ON "focusa_remind_message" USING btree ("user_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_platform_identifier_idx" ON "focusa_remind_user" USING btree ("platform","identifier");