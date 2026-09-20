# Botões compartilhados

`public/css/ui-buttons.css` é a base visual carregada pelo layout. Novas telas usam
`ui-btn`; telas existentes podem manter `btn`. Ambas usam os mesmos tokens.
Os arquivos dos módulos devem definir posição, largura e agrupamento das ações,
sem recriar cores, tipografia, altura ou estados do componente.

## Variantes

| Uso | Classe nova | Compatibilidade |
| --- | --- | --- |
| Salvar, adicionar, aprovar alteração | `ui-btn--primary` | `btn-primary`, `btn-green` |
| Editar, abrir | `ui-btn--outline` ou base | `btn-outline` ou base |
| Voltar, cancelar edição, manter item | `ui-btn--secondary` | `btn-secondary`, `btn-ghost` |
| Excluir, revogar, recusar alteração | `ui-btn--danger-soft` | `btn-danger`, `btn-red` |
| Filtro com destaque suave | `ui-btn--soft` | — |
| Ação em tabela | `ui-btn--table` + variante | `btn-sm` + variante |
| Controle compacto | `ui-btn--compact` + variante | `btn-sm` + variante |

```html
<button type="submit" class="ui-btn ui-btn--primary">Salvar</button>
<a href="/solicitacoes/minhas" class="ui-btn ui-btn--secondary">Voltar</a>
<button type="button" class="ui-btn ui-btn--danger-soft ui-btn--table">Excluir</button>
```

Sempre aplicar a classe base junto da variante. Usar `<button>` para ações,
`<a>` para navegação e `<summary>` para abrir um `<details>`.
As classes não autorizam operações nem substituem confirmação ou permissões.

## Medidas e estados

- Altura mínima: 38 px; compactos/tabela: 34 px; em largura até 768 px ou dispositivo
  com ponteiro impreciso: 44 px. Rótulos longos podem quebrar linha e aumentar a altura.
- Raio: 8 px. Fonte: 13 px, peso 700; compactos: 12 px.
- Ação principal: `#15803d`, texto branco; exclusão: texto `#b91c1c` sobre `#fff1f2`.
- Foco por teclado: contorno azul de 3 px. Movimento reduzido desativa transições.
- `disabled` mantém a semântica nativa e usa cores neutras. `aria-busy="true"`
  sinaliza trabalho em andamento; o código da tela continua responsável por evitar
  envio duplicado. `aria-disabled` em links exige bloquear também a ativação por
  teclado/remover o destino; CSS sozinho não desativa um link.
- Exclusão mantém os rótulos **Manter item / Confirmar exclusão**. Alteração usa
  **Recusar alteração / Confirmar alteração**, inclusive nos estados de espera.

## Cobertura desta etapa

Base `btn`/`ui-btn`, cabeçalho, Solicitações (lista e detalhe), Compras (fila,
cotação e consenso), acompanhamento da Diretoria e telas secundárias de Preventivas.
Nova Preventiva, Preventivas Programadas e Eleger Mecânicos compartilham o mesmo
layout secundário responsivo, isolado do dashboard principal.

OS, Equipamentos, Demandas, Fornecedores, PCM, Motores e Academia da Manutenção também usam a base compartilhada.
Colaboradores/RH passa a usar a mesma base nas ações da listagem, cadastro rápido
e ficha mestre; o RH direciona a abertura nominal para a ficha canônica
`/colaboradores/:id`, mantendo a rota histórica apenas como compatibilidade.
As classes históricas dos módulos permanecem apenas como hooks locais de layout
e compatibilidade, enquanto cor, tipografia, altura, raio, foco e estados ficam sob
responsabilidade de `ui-btn` e suas variantes. Preservar identificadores usados
pelo JavaScript e permissões existentes. Os mesmos tokens e variantes orientam a
biblioteca de componentes no Figma.

Ao mudar a base ou os módulos, atualizar a versão nos links dos templates e nos
recursos correspondentes do service worker para evitar CSS antigo em cache.
