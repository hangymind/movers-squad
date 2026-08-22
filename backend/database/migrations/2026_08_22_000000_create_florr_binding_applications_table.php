<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->timestamp('florr_verified_at')->nullable()->after('level');
        });

        Schema::create('florr_binding_applications', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('status', 16)->default('pending')->index();
            $table->string('screenshot_path')->nullable();
            $table->string('screenshot_mime', 64)->nullable();
            $table->unsignedBigInteger('screenshot_size')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('rejection_reason')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('result_seen_at')->nullable();
            $table->timestamp('image_deleted_at')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'created_at']);
        });

        DB::table('users')->where('is_admin', true)->update(['florr_verified_at' => now()]);
    }

    public function down(): void
    {
        Schema::dropIfExists('florr_binding_applications');
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('florr_verified_at');
        });
    }
};
