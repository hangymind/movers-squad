<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GeoHuntProfile extends Model
{
    protected $primaryKey = 'user_id';
    public $incrementing = false;
    protected $fillable = ['user_id', 'level', 'experience', 'wins', 'losses', 'matches_played'];

    protected function casts(): array
    {
        return ['level' => 'integer', 'experience' => 'integer', 'wins' => 'integer', 'losses' => 'integer', 'matches_played' => 'integer'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
