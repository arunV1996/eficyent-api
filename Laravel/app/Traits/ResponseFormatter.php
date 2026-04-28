<?php

namespace App\Traits;

trait ResponseFormatter
{
    /**
     * Format a successful JSON response.
     *
     * @param string $message
     * @param int $code
     * @param mixed $data
     * @return array
     */
    public function success($message = '', $code = 200, $data = [])
    {
        return [
            'success' => true,
            'message' => $message,
            'code' => $code,
            'data' => $data,
        ];
    }

    /**
     * Format a failed JSON response.
     *
     * @param string $message
     * @param int $code
     * @param mixed $data
     * @return array
     */
    public function fail($message = '', $code = 400, $data = [])
    {
        return [
            'success' => false,
            'message' => $message,
            'code' => $code,
            'data' => $data
        ];
    }
}