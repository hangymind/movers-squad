<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('teams', function (Blueprint $table): void {
            $table->timestamp('assembled_at')->nullable()->after('closed_at')->index();
        });

        Schema::create('team_messages', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('team_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->text('body');
            $table->timestamps();
            $table->index(['team_id', 'id']);
        });

        Schema::table('team_members', function (Blueprint $table): void {
            $table->unsignedBigInteger('last_read_message_id')->nullable()->after('joined_at');
            $table->index(['team_id', 'user_id', 'last_read_message_id'], 'team_members_read_cursor_index');
        });
    }

    public function down(): void
    {
        Schema::table('team_members', function (Blueprint $table): void {
            $table->dropIndex('team_members_read_cursor_index');
            $table->dropColumn('last_read_message_id');
        });
        Schema::dropIfExists('team_messages');
        Schema::table('teams', fn (Blueprint $table) => $table->dropColumn('assembled_at'));
    }
};
