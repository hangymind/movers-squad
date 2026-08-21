<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->boolean('is_admin')->default(false)->index();
            $table->timestamp('banned_at')->nullable()->index();
            $table->string('ban_id', 24)->nullable()->unique();
        });

        $florrId = env('ADMIN_FLORR_ID');
        $password = env('ADMIN_PASSWORD');
        if (! $florrId || ! $password) return;

        $admin = DB::table('users')->where('florr_id', $florrId)->first();
        $values = [
                'level' => 1,
                'password' => Hash::make($password),
                'avatar_url' => null,
                'is_admin' => true,
                'updated_at' => now(),
        ];
        if ($admin) {
            DB::table('users')->where('id', $admin->id)->update($values);
        } else {
            DB::table('users')->insert([...$values, 'username' => bin2hex(random_bytes(16)), 'florr_id' => $florrId, 'created_at' => now()]);
        }
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn(['is_admin', 'banned_at', 'ban_id']));
    }
};
