CREATE TABLE IF NOT EXISTS trilhas_conhecimento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  descricao TEXT,
  icone TEXT,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS academia_cursos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  descricao TEXT,
  trilha_id INTEGER,
  plataforma TEXT,
  link_curso TEXT,
  carga_horaria INTEGER,
  pontos INTEGER DEFAULT 10,
  nivel TEXT,
  imagem TEXT,
  ativo INTEGER DEFAULT 1,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trilha_id) REFERENCES trilhas_conhecimento(id)
);

CREATE TABLE IF NOT EXISTS academia_progresso (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER,
  curso_id INTEGER,
  status TEXT DEFAULT 'NAO_INICIADO',
  data_inicio DATETIME,
  data_conclusao DATETIME,
  certificado_url TEXT,
  horas_concluidas INTEGER DEFAULT 0,
  FOREIGN KEY (usuario_id) REFERENCES users(id),
  FOREIGN KEY (curso_id) REFERENCES academia_cursos(id),
  UNIQUE(usuario_id, curso_id)
);

CREATE TABLE IF NOT EXISTS academia_aulas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  curso_id INTEGER,
  titulo TEXT,
  descricao TEXT,
  video_url TEXT,
  ordem INTEGER,
  FOREIGN KEY (curso_id) REFERENCES academia_cursos(id)
);

CREATE TABLE IF NOT EXISTS academia_biblioteca (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT,
  descricao TEXT,
  arquivo_url TEXT,
  tipo TEXT,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_academia_cursos_trilha ON academia_cursos(trilha_id);
CREATE INDEX IF NOT EXISTS idx_academia_progresso_usuario ON academia_progresso(usuario_id);
CREATE INDEX IF NOT EXISTS idx_academia_progresso_status ON academia_progresso(status);

INSERT INTO trilhas_conhecimento (nome, descricao, icone)
SELECT 'Mecânica Industrial', 'Formação em fundamentos de equipamentos, ajustes e análise de falhas.', '🔧'
WHERE NOT EXISTS (SELECT 1 FROM trilhas_conhecimento WHERE nome='Mecânica Industrial');

INSERT INTO trilhas_conhecimento (nome, descricao, icone)
SELECT 'Soldagem e Serralheria', 'Capacitação em processos MIG, TIG e fabricação de estruturas metálicas.', '🧰'
WHERE NOT EXISTS (SELECT 1 FROM trilhas_conhecimento WHERE nome='Soldagem e Serralheria');

INSERT INTO trilhas_conhecimento (nome, descricao, icone)
SELECT 'Manutenção Industrial', 'Planejamento e execução de manutenção preventiva, corretiva e preditiva.', '🏭'
WHERE NOT EXISTS (SELECT 1 FROM trilhas_conhecimento WHERE nome='Manutenção Industrial');

INSERT INTO trilhas_conhecimento (nome, descricao, icone)
SELECT 'Elétrica Industrial', 'Treinamentos em comandos elétricos, motores e painéis industriais.', '⚡'
WHERE NOT EXISTS (SELECT 1 FROM trilhas_conhecimento WHERE nome='Elétrica Industrial');

INSERT INTO trilhas_conhecimento (nome, descricao, icone)
SELECT 'Segurança do Trabalho', 'Normas de segurança aplicadas ao ambiente industrial e manutenção.', '🦺'
WHERE NOT EXISTS (SELECT 1 FROM trilhas_conhecimento WHERE nome='Segurança do Trabalho');

INSERT INTO trilhas_conhecimento (nome, descricao, icone)
SELECT 'Fabricação Mecânica', 'Processos de usinagem, metrologia e interpretação técnica.', '📐'
WHERE NOT EXISTS (SELECT 1 FROM trilhas_conhecimento WHERE nome='Fabricação Mecânica');

INSERT INTO academia_cursos (titulo, descricao, trilha_id, plataforma, link_curso, carga_horaria, pontos, nivel, imagem, ativo)
SELECT
  'Leitura e interpretação de desenho técnico',
  'Interpretação de cotas, tolerâncias e simbologia técnica para manutenção.',
  (SELECT id FROM trilhas_conhecimento WHERE nome='Fabricação Mecânica' LIMIT 1),
  'INTERNO',
  '/academia/cursos',
  12,
  20,
  'BÁSICO',
  '/IMG/menu_campo_do_gado.png.png.png.png.png',
  1
WHERE NOT EXISTS (SELECT 1 FROM academia_cursos WHERE titulo='Leitura e interpretação de desenho técnico');

INSERT INTO academia_cursos (titulo, descricao, trilha_id, plataforma, link_curso, carga_horaria, pontos, nivel, imagem, ativo)
SELECT
  'Fundamentos da manutenção industrial',
  'Conceitos essenciais de manutenção preventiva, corretiva e indicadores.',
  (SELECT id FROM trilhas_conhecimento WHERE nome='Manutenção Industrial' LIMIT 1),
  'INTERNO',
  '/academia/cursos',
  10,
  15,
  'BÁSICO',
  '/IMG/login_campo_do_gado.png.png.png',
  1
WHERE NOT EXISTS (SELECT 1 FROM academia_cursos WHERE titulo='Fundamentos da manutenção industrial');

INSERT INTO academia_cursos (titulo, descricao, trilha_id, plataforma, link_curso, carga_horaria, pontos, nivel, imagem, ativo)
SELECT 'Soldagem MIG', 'Boas práticas de soldagem MIG para estruturas de manutenção.',
  (SELECT id FROM trilhas_conhecimento WHERE nome='Soldagem e Serralheria' LIMIT 1),
  'CURSA', 'https://cursa.app/pt/curso/soldagem', 8, 18, 'INTERMEDIÁRIO', '/IMG/logopdf_campo_do_gado.png.png', 1
WHERE NOT EXISTS (SELECT 1 FROM academia_cursos WHERE titulo='Soldagem MIG');

INSERT INTO academia_cursos (titulo, descricao, trilha_id, plataforma, link_curso, carga_horaria, pontos, nivel, imagem, ativo)
SELECT 'Soldagem TIG', 'Ajustes finos e execução de soldagem TIG em manutenção industrial.',
  (SELECT id FROM trilhas_conhecimento WHERE nome='Soldagem e Serralheria' LIMIT 1),
  'CURSA', 'https://cursa.app/pt/curso/soldagem', 8, 18, 'INTERMEDIÁRIO', '/IMG/logopdf_campo_do_gado.png.png', 1
WHERE NOT EXISTS (SELECT 1 FROM academia_cursos WHERE titulo='Soldagem TIG');

INSERT INTO academia_cursos (titulo, descricao, trilha_id, plataforma, link_curso, carga_horaria, pontos, nivel, imagem, ativo)
SELECT 'Rolamentos industriais', 'Identificação de falhas e substituição correta de rolamentos.',
  (SELECT id FROM trilhas_conhecimento WHERE nome='Mecânica Industrial' LIMIT 1),
  'YOUTUBE', 'https://www.youtube.com/results?search_query=rolamentos+industriais', 6, 12, 'BÁSICO', '/IMG/menu_campo_do_gado.png.png.png.png.png', 1
WHERE NOT EXISTS (SELECT 1 FROM academia_cursos WHERE titulo='Rolamentos industriais');

INSERT INTO academia_cursos (titulo, descricao, trilha_id, plataforma, link_curso, carga_horaria, pontos, nivel, imagem, ativo)
SELECT 'Alinhamento de eixos', 'Fundamentos práticos para alinhamento e redução de vibração.',
  (SELECT id FROM trilhas_conhecimento WHERE nome='Mecânica Industrial' LIMIT 1),
  'INTERNO', '/academia/cursos', 6, 14, 'INTERMEDIÁRIO', '/IMG/menu_campo_do_gado.png.png.png.png.png', 1
WHERE NOT EXISTS (SELECT 1 FROM academia_cursos WHERE titulo='Alinhamento de eixos');

INSERT INTO academia_cursos (titulo, descricao, trilha_id, plataforma, link_curso, carga_horaria, pontos, nivel, imagem, ativo)
SELECT 'Metrologia industrial', 'Uso correto de instrumentos para inspeção dimensional.',
  (SELECT id FROM trilhas_conhecimento WHERE nome='Fabricação Mecânica' LIMIT 1),
  'INTERNO', '/academia/cursos', 10, 16, 'BÁSICO', '/IMG/login_campo_do_gado.png.png.png', 1
WHERE NOT EXISTS (SELECT 1 FROM academia_cursos WHERE titulo='Metrologia industrial');

INSERT INTO academia_cursos (titulo, descricao, trilha_id, plataforma, link_curso, carga_horaria, pontos, nivel, imagem, ativo)
SELECT 'Segurança NR12', 'Aplicação da NR12 para segurança em máquinas e equipamentos.',
  (SELECT id FROM trilhas_conhecimento WHERE nome='Segurança do Trabalho' LIMIT 1),
  'CURSA', 'https://cursa.app/pt/curso/nr12', 4, 10, 'BÁSICO', '/IMG/logopdf_campo_do_gado.png.png', 1
WHERE NOT EXISTS (SELECT 1 FROM academia_cursos WHERE titulo='Segurança NR12');

INSERT INTO academia_cursos (titulo, descricao, trilha_id, plataforma, link_curso, carga_horaria, pontos, nivel, imagem, ativo)
SELECT 'Manutenção de redutores', 'Diagnóstico, inspeção e manutenção preventiva de redutores.',
  (SELECT id FROM trilhas_conhecimento WHERE nome='Manutenção Industrial' LIMIT 1),
  'INTERNO', '/academia/cursos', 8, 17, 'INTERMEDIÁRIO', '/IMG/login_campo_do_gado.png.png.png', 1
WHERE NOT EXISTS (SELECT 1 FROM academia_cursos WHERE titulo='Manutenção de redutores');

INSERT INTO academia_aulas (curso_id, titulo, descricao, video_url, ordem)
SELECT c.id, 'Introdução ao curso', 'Contexto e objetivos da trilha técnica.', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 1
FROM academia_cursos c
WHERE c.titulo='Fundamentos da manutenção industrial'
  AND NOT EXISTS (
    SELECT 1 FROM academia_aulas a WHERE a.curso_id = c.id AND a.titulo='Introdução ao curso'
  );

INSERT INTO academia_biblioteca (titulo, descricao, arquivo_url, tipo)
SELECT 'Manual de Boas Práticas de Soldagem', 'Guia interno para padronização de soldagem na manutenção.', '/uploads/manual-soldagem.pdf', 'MANUAL'
WHERE NOT EXISTS (SELECT 1 FROM academia_biblioteca WHERE titulo='Manual de Boas Práticas de Soldagem');

INSERT INTO academia_biblioteca (titulo, descricao, arquivo_url, tipo)
SELECT 'Procedimento de bloqueio e etiquetagem', 'Procedimento de segurança para intervenções em máquinas.', '/uploads/procedimento-loto.pdf', 'PROCEDIMENTO'
WHERE NOT EXISTS (SELECT 1 FROM academia_biblioteca WHERE titulo='Procedimento de bloqueio e etiquetagem');
