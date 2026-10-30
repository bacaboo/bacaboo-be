-- ============================================================
-- BacaBoo - Skema Database (PostgreSQL)
-- Sumber: TRD bagian 2.1
-- Tambahan: kolom stars_count, active_streak_days, last_played_date
-- di tabel students (dibutuhkan response API login di TRD 3.1)
-- ============================================================

-- 1. USERS (akun induk untuk semua peran)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    role VARCHAR(32) NOT NULL CHECK (role IN ('student', 'teacher', 'parent', 'admin')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. STUDENTS (profil siswa)
CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    display_name VARCHAR(64) NOT NULL,
    picture_pin_hash VARCHAR(255) NOT NULL,
    avatar_code VARCHAR(32) DEFAULT 'boo_classic',
    date_of_birth DATE,
    stars_count INT DEFAULT 0,
    active_streak_days INT DEFAULT 0,
    last_played_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. TEACHERS & CLASSROOMS
CREATE TABLE teachers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(128) NOT NULL,
    school_name VARCHAR(128) NOT NULL,
    nip VARCHAR(64)
);

CREATE TABLE classrooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID REFERENCES teachers(id) ON DELETE CASCADE,
    grade_level INT NOT NULL CHECK (grade_level BETWEEN 1 AND 6),
    class_name VARCHAR(64) NOT NULL,
    academic_year VARCHAR(16) NOT NULL
);

CREATE TABLE classroom_students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classroom_id UUID REFERENCES classrooms(id) ON DELETE CASCADE,
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(classroom_id, student_id)
);

-- 4. PARENTS & hubungan dengan siswa
CREATE TABLE parents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(128) NOT NULL,
    phone_number VARCHAR(32)
);

CREATE TABLE parent_students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES parents(id) ON DELETE CASCADE,
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    relationship VARCHAR(32) DEFAULT 'parent',
    UNIQUE(parent_id, student_id)
);

-- 5. KONTEN PEMBELAJARAN
CREATE TABLE learning_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_code VARCHAR(32) UNIQUE NOT NULL,
    sld_domain VARCHAR(32) NOT NULL CHECK (sld_domain IN ('dyslexia', 'dysgraphia', 'dyscalculia')),
    title VARCHAR(128) NOT NULL,
    description TEXT,
    difficulty_level INT DEFAULT 1
);

CREATE TABLE learning_vocabularies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id UUID REFERENCES learning_modules(id) ON DELETE CASCADE,
    target_word VARCHAR(64) NOT NULL,
    syllable_1 VARCHAR(32),
    syllable_2 VARCHAR(32),
    audio_full_url VARCHAR(255) NOT NULL,
    audio_syl1_url VARCHAR(255),
    audio_syl2_url VARCHAR(255),
    image_asset_url VARCHAR(255) NOT NULL,
    distractor_syllable VARCHAR(32)
);

-- 6. SESI BELAJAR & LOG KESALAHAN
CREATE TABLE learning_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    module_id UUID REFERENCES learning_modules(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    total_items_attempted INT DEFAULT 0,
    successful_items INT DEFAULT 0,
    scaffolding_triggered_count INT DEFAULT 0
);

CREATE TABLE error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES learning_sessions(id) ON DELETE CASCADE,
    target_item VARCHAR(64) NOT NULL,
    erroneous_input VARCHAR(64) NOT NULL,
    error_category VARCHAR(32) NOT NULL CHECK (error_category IN (
        'reversal_pq', 'reversal_bd', 'phoneme_mismatch', 'number_magnitude', 'place_value'
    )),
    scaffold_level_activated INT DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. HADIAH & GAMIFIKASI
CREATE TABLE student_rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    reward_code VARCHAR(64) NOT NULL,
    reward_type VARCHAR(32) NOT NULL CHECK (reward_type IN ('costume', 'sticker', 'badge')),
    is_equipped BOOLEAN DEFAULT FALSE,
    unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. PENGATURAN AKSESIBILITAS
CREATE TABLE user_accessibility_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    theme_palette VARCHAR(32) DEFAULT 'warm_ivory',
    letter_spacing_em NUMERIC(3, 2) DEFAULT 0.14,
    speech_rate NUMERIC(3, 2) DEFAULT 0.90,
    enable_reduced_motion BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
