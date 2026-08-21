<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Team extends Model
{
    use HasFactory;

    public const MAX_MEMBERS = 4;

    protected $fillable = ['game_name', 'note', 'owner_id', 'closed_at', 'min_level', 'excluded_florr_ids'];

    protected function casts(): array
    {
        return ['closed_at' => 'datetime', 'min_level' => 'integer', 'excluded_florr_ids' => 'array'];
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'team_members')
            ->withPivot('joined_at')
            ->orderByPivot('joined_at');
    }
}
