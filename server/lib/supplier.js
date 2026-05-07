'use strict';

// A supplier contact (panel-beater, assessor, service provider, etc.) is not a
// data subject in the FAIS/POPIA/FICA sense — it sits outside the advisory
// pipeline. Both contact_type AND client_category must be 'Supplier' to qualify
// so a misclassification of one field can't accidentally bypass compliance gates.

const SUPPLIER_VALUE = 'Supplier';

function isSupplierContact(record) {
  return !!record
    && record.contact_type    === SUPPLIER_VALUE
    && record.client_category === SUPPLIER_VALUE;
}

// SQL fragment for excluding supplier contacts. Designed to be appended to a
// WHERE clause that already references contacts as alias `c` (or another alias
// passed in). NOT NULL is treated as supplier=false; the predicate excludes
// only rows where both columns equal 'Supplier'.
function notSupplierSql(alias = 'c') {
  return `(${alias}.contact_type IS NULL OR ${alias}.contact_type != 'Supplier'
           OR ${alias}.client_category IS NULL OR ${alias}.client_category != 'Supplier')`;
}

// Inverse of notSupplierSql — predicate matches only rows where both columns
// equal 'Supplier'. Suppliers are shared infrastructure (panel-beaters,
// assessors, etc.) and are visible across broker isolation boundaries.
function isSupplierSql(alias = 'c') {
  return `(${alias}.contact_type = 'Supplier' AND ${alias}.client_category = 'Supplier')`;
}

module.exports = {
  isSupplierContact,
  notSupplierSql,
  isSupplierSql,
  SUPPLIER_VALUE,
};
