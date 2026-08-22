<?php

use App\Rules\SafeAvatarUrl;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('users')
            ->whereNotNull('avatar_url')
            ->orderBy('id')
            ->chunkById(500, function ($users): void {
                foreach ($users as $user) {
                    if (! SafeAvatarUrl::isValid($user->avatar_url)) {
                        DB::table('users')->where('id', $user->id)->update(['avatar_url' => null]);
                    }
                }
            });
    }

    public function down(): void
    {
        // Unsafe external URLs are intentionally not restorable.
    }
};
