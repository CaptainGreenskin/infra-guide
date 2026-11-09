/* The extension delegates its numerical work to this shared library. */
double infraguide_rowdot3(const double a[3], const double b[3])
{
    double result = 0.0;
    for (int i = 0; i < 3; i++) {
        result += a[i] * b[i];
    }
    return result;
}
