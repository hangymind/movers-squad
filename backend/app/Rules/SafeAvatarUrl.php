<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class SafeAvatarUrl implements ValidationRule
{
    private const LOCAL_TLDS = ['home', 'internal', 'invalid', 'lan', 'local', 'localhost', 'test'];

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || ! self::isValid($value)) {
            $fail('头像链接必须是安全的 HTTPS 外链，且不能指向本机、IP 地址或非标准端口。');
        }
    }

    public static function isValid(?string $value): bool
    {
        if ($value === null || $value === '' || strlen($value) > 2048) {
            return false;
        }

        if (preg_match('/[\x00-\x1F\x7F]/', $value) === 1 || filter_var($value, FILTER_VALIDATE_URL) === false) {
            return false;
        }

        $parts = parse_url($value);
        if (! is_array($parts) || strtolower($parts['scheme'] ?? '') !== 'https') {
            return false;
        }

        if (isset($parts['user']) || isset($parts['pass']) || isset($parts['fragment'])) {
            return false;
        }

        if (isset($parts['port']) && $parts['port'] !== 443) {
            return false;
        }

        $host = strtolower($parts['host'] ?? '');
        if ($host === '' || str_ends_with($host, '.') || str_contains($host, ':')) {
            return false;
        }

        $unwrappedHost = trim($host, '[]');
        if (filter_var($unwrappedHost, FILTER_VALIDATE_IP) !== false) {
            return false;
        }

        if (filter_var($host, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) === false || ! str_contains($host, '.')) {
            return false;
        }

        $topLevelDomain = strrchr($host, '.');
        if ($topLevelDomain === false || in_array(substr($topLevelDomain, 1), self::LOCAL_TLDS, true)) {
            return false;
        }

        return true;
    }
}
