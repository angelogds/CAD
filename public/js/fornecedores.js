document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('[data-supplier-form]');
  if (!form) return;

  const productValue = form.querySelector('[data-products-value]');
  const itemEntry = form.querySelector('[data-item-entry]');
  const selectedItems = form.querySelector('[data-selected-items]');
  const noItems = form.querySelector('[data-no-items]');
  let products = String(productValue?.value || '').split(',').map(item => item.trim()).filter(Boolean);

  const uniqueProducts = () => {
    const seen = new Set();
    products = products.filter(item => {
      const key = item.toLocaleLowerCase('pt-BR');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const renderProducts = () => {
    uniqueProducts();
    if (productValue) productValue.value = products.join(', ');
    if (!selectedItems) return;
    const categoryInputs = [...form.querySelectorAll('[name="categorias"][type="checkbox"]:checked')];
    const categories = categoryInputs.map(input => ({ item: input.value, input }));
    const entries = [
      ...categories.map(category => ({ ...category, type: 'category' })),
      ...products.filter(item => !categories.some(category => category.item.toLocaleLowerCase('pt-BR') === item.toLocaleLowerCase('pt-BR'))).map(item => ({ item, type: 'product' }))
    ];
    selectedItems.replaceChildren(...entries.map(entry => {
      const chip = document.createElement('span');
      chip.className = 'selected-chip';
      chip.append(document.createTextNode(entry.item));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remover ${entry.item}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        if (entry.type === 'category') entry.input.checked = false;
        else products = products.filter(item => item !== entry.item);
        renderProducts();
        updateSummary();
      });
      chip.append(remove);
      return chip;
    }));
    noItems?.toggleAttribute('hidden', entries.length > 0);
  };

  const addProduct = () => {
    const values = String(itemEntry?.value || '').split(',').map(item => item.trim()).filter(Boolean);
    if (!values.length) {
      itemEntry?.focus();
      return;
    }
    products.push(...values);
    if (itemEntry) itemEntry.value = '';
    renderProducts();
    updateSummary();
    itemEntry?.focus();
  };

  form.querySelector('[data-add-item]')?.addEventListener('click', addProduct);
  itemEntry?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addProduct();
    }
  });

  const hasValue = name => Boolean(form.querySelector(`[name="${name}"]`)?.value.trim());
  function updateSummary() {
    const hasCategories = [...form.querySelectorAll('[name="categorias"][type="checkbox"]')].some(input => input.checked);
    const states = {
      id: hasValue('nome_fantasia'),
      contact: hasValue('responsavel_comercial') && (hasValue('whatsapp') || hasValue('telefone')),
      products: hasCategories || products.length > 0 || hasValue('servicos'),
      commercial: ['prazo_medio_entrega', 'condicao_pagamento', 'pedido_minimo', 'frete'].some(hasValue)
    };
    Object.entries(states).forEach(([key, complete]) => {
      document.querySelector(`[data-check="${key}"]`)?.classList.toggle('done', complete);
    });
  }

  const cnpj = form.querySelector('[name="cnpj"]');
  cnpj?.addEventListener('input', () => {
    const digits = cnpj.value.replace(/\D/g, '').slice(0, 14);
    cnpj.value = digits.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
  });

  const uf = form.querySelector('[name="uf"]');
  uf?.addEventListener('input', () => { uf.value = uf.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 2); });

  form.addEventListener('input', updateSummary);
  form.addEventListener('change', event => {
    if (event.target.matches('[name="categorias"][type="checkbox"]')) renderProducts();
    updateSummary();
  });
  renderProducts();
  updateSummary();
});
