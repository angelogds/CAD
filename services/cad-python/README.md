# CAD Python Engine V1

Serviço auxiliar do módulo **Desenho Técnico 2D**. Ele não substitui o Node.js/Express nem o motor gráfico do navegador: executa tarefas técnicas mais pesadas por API interna.

## Funções V1

- validação geométrica do desenho;
- área, perímetro, comprimento linear e peso estimado;
- exportação DXF;
- importação DXF para o formato JSON atual do editor;
- health check para o Node degradar com segurança quando o serviço estiver indisponível.

## Executar localmente

```bash
cd services/cad-python
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

No serviço Node, configure:

```text
CAD_PYTHON_URL=http://127.0.0.1:8000
CAD_PYTHON_TOKEN=<segredo-opcional>
```

Se `CAD_PYTHON_TOKEN` for usado no Node, configure o mesmo valor como `CAD_ENGINE_TOKEN` no serviço Python.

## Railway

Crie um serviço separado apontando o Root Directory para `services/cad-python`, usando o `Dockerfile` deste diretório. No serviço Node, informe a URL privada/pública resultante em `CAD_PYTHON_URL`.

## Segurança

Se o Python estiver fora do ar ou não configurado, o editor CAD continua funcionando. Apenas Análise Técnica e importação/exportação DXF ficam indisponíveis.
