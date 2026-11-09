#define PY_SSIZE_T_CLEAN
#include <Python.h>

double infraguide_rowdot3(const double a[3], const double b[3]);

static PyObject *dot3(PyObject *self, PyObject *args)
{
    double a[3];
    double b[3];
    (void)self;
    if (!PyArg_ParseTuple(args, "(ddd)(ddd):dot3",
                          &a[0], &a[1], &a[2], &b[0], &b[1], &b[2])) {
        return NULL;
    }
    return PyFloat_FromDouble(infraguide_rowdot3(a, b));
}

static PyMethodDef methods[] = {
    {"dot3", dot3, METH_VARARGS, "Compute a three-element dot product."},
    {NULL, NULL, 0, NULL},
};

static struct PyModuleDef module = {
    .m_base = PyModuleDef_HEAD_INIT,
    .m_name = "infra_rowdot",
    .m_size = -1,
    .m_methods = methods,
};

#ifndef ROW_INIT
#define ROW_INIT PyInit_infra_rowdot
#endif

PyMODINIT_FUNC ROW_INIT(void)
{
    return PyModule_Create(&module);
}
