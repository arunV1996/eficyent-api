"use strict";
const { randomUUID } = require("crypto");

// Vietnam provinces/cities for the dynamic city dropdown.
const VNM_CITIES = [
    "An Giang", "Ba Ria Vung Tau", "Bac Giang", "Bac Kan", "Bac Lieu",
    "Bac Ninh", "Ben Tre", "Binh Dinh", "Binh Doung", "Binh Phuoc",
    "Binh Thuan", "Ca Mau", "Can Tho", "Cao Bang", "Da Nang", "Dak Lak",
    "Dak Nong", "Dien Bien", "Dong Nai", "Dong Thap", "Gia Lai",
    "Ha Giang", "Ha Nam", "Ha Noi", "Ha Tinh", "Hai Duong", "Hai Phong",
    "Hau Giang", "Ho Chi Minh", "Hoa Binh", "Hung Yen", "Khanh Hoa",
    "Kien Giang", "Kon Tum", "Lai Chau", "Lam Dong", "Lang Son",
    "Lao Cai", "Long An", "Nam Dinh", "Nghe An", "Nguyen", "Ninh Binh",
    "Ninh Thuan", "Phu Tho", "Phu Yen", "Quang Binh", "Quang Nam",
    "Quang Ngai", "Quang Ninh", "Quang Tri", "Soc Trang", "Son La",
    "Tay Ninh", "Thai Binh", "Thanh Hoa", "Thua Thien Hue", "Tien Giang",
    "Tra Vinh", "Tuyen Quang", "Vinh Long", "Vinh Phuc", "Yen Bai",
];

module.exports = {
    async up(queryInterface) {
        for (const cityName of VNM_CITIES) {
            const [existing] = await queryInterface.sequelize.query(
                "SELECT id FROM cities WHERE city = :city AND country = 'VNM' LIMIT 1",
                { replacements: { city: cityName } },
            );
            if (existing.length === 0) {
                await queryInterface.sequelize.query(
                    "INSERT INTO cities (unique_id, city, state, country, external_type, status, created_at, updated_at) " +
                        "VALUES (:uniqueId, :city, NULL, 'VNM', 'EPF', 1, NOW(), NOW())",
                    {
                        replacements: {
                            uniqueId: randomUUID(),
                            city: cityName,
                        },
                    },
                );
            }
        }
    },

    async down(queryInterface) {
        await queryInterface.sequelize.query(
            "DELETE FROM cities WHERE country = 'VNM' AND external_type = 'EPF'",
        );
    },
};
